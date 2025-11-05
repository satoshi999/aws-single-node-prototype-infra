import {
  Stack,
  StackProps,
  CfnOutput,
  Duration,
  aws_ec2 as ec2,
  aws_iam as iam,
} from "aws-cdk-lib";
import { Construct } from "constructs";

export class Ec2Stack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const projectName = process.env.PROJECT_NAME ?? "aws-server-template";
    const instanceType = process.env.EC2_TYPE ?? "t3.medium";
    const keyName = process.env.EC2_KEY_NAME ?? "aws-server-template-key";
    const useEip = (process.env.USE_EIP ?? "true") === "true";

    // Default VPC
    const vpc = ec2.Vpc.fromLookup(this, "Vpc", { isDefault: true });

    // SG: 22, 80, 443開放（必要なら閉じる）
    const sg = new ec2.SecurityGroup(this, "Sg", {
      vpc,
      description: `${projectName} SG`,
      allowAllOutbound: true,
    });
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22));
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));

    // SSM接続用ロール（将来便利）
    const role = new iam.Role(this, "Ec2Role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
      ],
    });

    // Ubuntu 22.04 LTS (Jammy) AMI, SSM parameter
    const ubuntuAmi = ec2.MachineImage.fromSsmParameter(
      "/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp3/ami-id"
    );

    // Docker & Compose install
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "set -eux",
      "export DEBIAN_FRONTEND=noninteractive",
      "sudo apt-get update -y",
      "sudo apt-get install -y ca-certificates curl gnupg lsb-release",
      "sudo install -m 0755 -d /etc/apt/keyrings",
      "curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg",
      'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null',
      "sudo apt-get update -y",
      "sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin",
      "sudo usermod -aG docker ubuntu || true",
      "sudo systemctl enable docker",
      "sudo systemctl start docker",
      // 目印
      `echo "${projectName} provisioned" | sudo tee /etc/motd`
    );

    const instance = new ec2.Instance(this, "Ec2", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: new ec2.InstanceType(instanceType),
      machineImage: ubuntuAmi,
      role,
      keyName,
      securityGroup: sg,
    });

    instance.addUserData(userData.render());

    // EIP（任意）
    let publicIpOutput: string;
    if (useEip) {
      const eip = new ec2.CfnEIP(this, "Eip", {});
      new ec2.CfnEIPAssociation(this, "EipAssoc", {
        eip: eip.ref,
        instanceId: instance.instanceId,
      });
      publicIpOutput = eip.ref;
    } else {
      publicIpOutput = instance.instancePublicIp;
    }

    new CfnOutput(this, "Project", { value: projectName });
    new CfnOutput(this, "InstanceId", { value: instance.instanceId });
    new CfnOutput(this, "PublicIp", { value: publicIpOutput });
    new CfnOutput(this, "SshExample", {
      value: `ssh -i <${keyName}.pem> ubuntu@${publicIpOutput}`,
    });
  }
}
