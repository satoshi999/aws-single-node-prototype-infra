import fs from "fs";
import {
  CreateUserPoolCommand,
  CreateUserPoolDomainCommand,
  CreateUserPoolClientCommand,
  CreateIdentityProviderCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognito, REGION_CONST } from "../aws";

const PROJECT = required("PROJECT_NAME");
const DOMAIN_PREFIX = sanitize(env("COGNITO_DOMAIN_PREFIX", PROJECT));
const CALLBACK_URL = required("COGNITO_CALLBACK_URL"); // 例: http://<PublicIp>/
const LOGOUT_URL = env("COGNITO_LOGOUT_URL", CALLBACK_URL);
const GOOGLE_ID = required("GOOGLE_OAUTH_CLIENT_ID");
const GOOGLE_SECRET = required("GOOGLE_OAUTH_CLIENT_SECRET");

function env(k: string, d?: string) {
  return process.env[k] ?? d ?? "";
}

function required(k: string) {
  const v = env(k);
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}

function sanitize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .slice(0, 25);
}

function appendSummary(md: string) {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return; // ローカル実行時は何もしない
  fs.appendFileSync(path, md);
}

async function main() {
  const up = await cognito.send(
    new CreateUserPoolCommand({
      PoolName: PROJECT,
      AutoVerifiedAttributes: ["email"],
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: false },
      AccountRecoverySetting: {
        RecoveryMechanisms: [{ Name: "verified_email", Priority: 1 }],
      },
    })
  );
  const userPoolId = up.UserPool?.Id!;

  // Hosted UI ドメイン（Google 連携で必須）
  await cognito.send(
    new CreateUserPoolDomainCommand({
      Domain: DOMAIN_PREFIX,
      UserPoolId: userPoolId,
    })
  );

  // Google IdP を登録
  await cognito.send(
    new CreateIdentityProviderCommand({
      UserPoolId: userPoolId,
      ProviderName: "Google",
      ProviderType: "Google",
      ProviderDetails: {
        client_id: GOOGLE_ID,
        client_secret: GOOGLE_SECRET,
        authorize_scopes: "openid email profile",
      },
      AttributeMapping: {
        email: "email",
        given_name: "given_name",
        family_name: "family_name",
        picture: "picture",
      },
    })
  );

  // SPA向けクライアント（PKCE、シークレットなし）
  const app = await cognito.send(
    new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: `${PROJECT}-web`,
      GenerateSecret: false,
      AllowedOAuthFlowsUserPoolClient: true,
      AllowedOAuthFlows: ["code"],
      AllowedOAuthScopes: ["openid", "email", "profile"],
      SupportedIdentityProviders: ["Google"],
      CallbackURLs: [CALLBACK_URL],
      LogoutURLs: [LOGOUT_URL],
    })
  );

  const domain = `${DOMAIN_PREFIX}.auth.${REGION_CONST}.amazoncognito.com`;
  const issuer = `https://cognito-idp.${REGION_CONST}.amazonaws.com/${userPoolId}`;
  const jwks = `${issuer}/.well-known/jwks.json`;
  const googleRedirect = `https://${domain}/oauth2/idpresponse`;

  console.log(
    `Project=${PROJECT}\nUserPoolId=${userPoolId}\nUserPoolClientId=${app.UserPoolClient?.ClientId}\n` +
      `CognitoDomain=${domain}\nIssuer=${issuer}\nJwksUrl=${jwks}\nGoogleAuthorizedRedirectURI=${googleRedirect}`
  );

  const summary = `
  ## ✅ Cognito Provision Result

  - **Project**: \`${PROJECT}\`
  - **UserPoolId**: \`${userPoolId}\`
  - **UserPoolClientId**: \`${app.UserPoolClient?.ClientId}\`
  - **Cognito Domain**: \`${domain}\`
  - **Issuer**: \`${issuer}\`
  - **JWKS URL**:
    ${jwks}

  ### 🔁 Google OAuth Redirect URI
  \`\`\`
  ${googleRedirect}
  \`\`\`
  `;

  appendSummary(summary);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
