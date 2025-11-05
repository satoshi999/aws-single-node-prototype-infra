#!/usr/bin/env node
import "source-map-support/register";
import { App } from "aws-cdk-lib";
import { Ec2Stack } from "../lib/ec2-stack";

const app = new App();
new Ec2Stack(app, "Ec2Stack", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "ap-northeast-1" },
});
