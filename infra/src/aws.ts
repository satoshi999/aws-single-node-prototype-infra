import { EC2Client } from "@aws-sdk/client-ec2";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { SSMClient } from "@aws-sdk/client-ssm";

const REGION =
  process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-northeast-1";

export const ec2 = new EC2Client({ region: REGION });
export const cognito = new CognitoIdentityProviderClient({ region: REGION });
export const ssm = new SSMClient({ region: REGION });

export const REGION_CONST = REGION;
