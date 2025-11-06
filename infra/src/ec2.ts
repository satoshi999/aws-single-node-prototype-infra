import {
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  DescribeImagesCommand,
  RunInstancesCommand,
  RunInstancesCommandInput,
  CreateTagsCommand,
  AllocateAddressCommand,
  AssociateAddressCommand,
  DescribeInstancesCommand,
} from "@aws-sdk/client-ec2";
import { ec2, REGION_CONST } from "./aws";

const PROJECT = required("PROJECT_NAME");
const INSTANCE_TYPE = required("EC2_TYPE");
const KEY_NAME = required("EC2_KEY_NAME");
const USE_EIP = required("USE_EIP").toLowerCase() === "true";

function required(k: string) {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}

async function getLatestUbuntu2404Ami() {
  const res = await ec2.send(
    new DescribeImagesCommand({
      Owners: ["099720109477"], // Ubuntu公式
      Filters: [
        {
          Name: "name",
          Values: [
            "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*",
          ],
        },
        { Name: "architecture", Values: ["x86_64"] },
      ],
    })
  );

  if (!res.Images?.length) throw new Error("Ubuntu 24.04 AMI not found");
  // 最新作成日順でソート
  const latest = res.Images.sort(
    (a, b) =>
      new Date(b.CreationDate!).getTime() - new Date(a.CreationDate!).getTime()
  )[0];
  console.log("✅ Latest Ubuntu 24.04 AMI:", latest.ImageId, latest.Name);
  return latest.ImageId!;
}

async function getDefaultSubnetId(): Promise<string> {
  const vpcs = await ec2.send(
    new DescribeVpcsCommand({
      Filters: [{ Name: "isDefault", Values: ["true"] }],
    })
  );
  if (!vpcs.Vpcs?.[0]?.VpcId) throw new Error("No default VPC");
  const vpcId = vpcs.Vpcs[0].VpcId!;
  const subs = await ec2.send(
    new DescribeSubnetsCommand({
      Filters: [{ Name: "vpc-id", Values: [vpcId] }],
    })
  );
  if (!subs.Subnets?.[0]?.SubnetId) throw new Error("No subnet in default VPC");
  return subs.Subnets[0].SubnetId!;
}

async function createSg(): Promise<string> {
  const name = `${PROJECT}-sg`;
  const created = await ec2.send(
    new CreateSecurityGroupCommand({
      GroupName: name,
      Description: `SG for ${PROJECT}`,
      VpcId: undefined, // default VPC
    })
  );
  const sgId = created.GroupId!;
  await ec2.send(
    new AuthorizeSecurityGroupIngressCommand({
      GroupId: sgId,
      IpPermissions: [
        {
          IpProtocol: "tcp",
          FromPort: 22,
          ToPort: 22,
          IpRanges: [{ CidrIp: "0.0.0.0/0" }],
        },
        {
          IpProtocol: "tcp",
          FromPort: 80,
          ToPort: 80,
          IpRanges: [{ CidrIp: "0.0.0.0/0" }],
        },
        {
          IpProtocol: "tcp",
          FromPort: 443,
          ToPort: 443,
          IpRanges: [{ CidrIp: "0.0.0.0/0" }],
        },
      ],
    })
  );
  return sgId;
}

const USER_DATA = `#cloud-config
runcmd:
  - apt-get update -y
  - apt-get install -y ca-certificates curl gnupg
  - install -m 0755 -d /etc/apt/keyrings
  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  - chmod a+r /etc/apt/keyrings/docker.gpg
  - echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
  - apt-get update -y
  - apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  - usermod -aG docker ubuntu
  - systemctl enable docker
  - systemctl start docker
`;

async function main() {
  const subnetId = await getDefaultSubnetId();
  const sgId = await createSg();
  const ImageId = await getLatestUbuntu2404Ami();

  const run = await ec2.send(
    new RunInstancesCommand({
      ImageId: ImageId,
      InstanceType: INSTANCE_TYPE,
      KeyName: KEY_NAME,
      MinCount: 1,
      MaxCount: 1,
      SubnetId: subnetId,
      SecurityGroupIds: [sgId],
      UserData: Buffer.from(USER_DATA).toString("base64"),
      TagSpecifications: [
        {
          ResourceType: "instance",
          Tags: [
            { Key: "Name", Value: PROJECT },
            { Key: "Project", Value: PROJECT },
          ],
        },
      ],
    } as RunInstancesCommandInput)
  );
  const instanceId = run.Instances?.[0]?.InstanceId!;
  await ec2.send(
    new CreateTagsCommand({
      Resources: [instanceId],
      Tags: [{ Key: "Project", Value: PROJECT }],
    })
  );

  // Public IP（EIPを使う or デフォルト割当のPublicIpを待つ）
  let publicIp = "";
  if (USE_EIP) {
    const alloc = await ec2.send(new AllocateAddressCommand({ Domain: "vpc" }));
    await ec2.send(
      new AssociateAddressCommand({
        InstanceId: instanceId,
        AllocationId: alloc.AllocationId,
      })
    );
    publicIp = alloc.PublicIp!;
  } else {
    // インスタンスの PublicIp の付与を待つ（簡易）
    for (let i = 0; i < 30; i++) {
      const d = await ec2.send(
        new DescribeInstancesCommand({ InstanceIds: [instanceId] })
      );
      const ip = d.Reservations?.[0]?.Instances?.[0]?.PublicIpAddress;
      if (ip) {
        publicIp = ip;
        break;
      }
      await new Promise((r) => setTimeout(r, 4000));
    }
  }

  const ssh = `ssh -i <${KEY_NAME}.pem> ubuntu@${publicIp}`;
  // GitHub Actions 用出力
  console.log(
    `Project=${PROJECT}\nInstanceId=${instanceId}\nPublicIp=${publicIp}\nSshExample=${ssh}\nRegion=${REGION_CONST}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
