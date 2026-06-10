import { App, Stack } from "aws-cdk-lib";

const app = new App();

new Stack(app, "MarkosPlaceholderStack", {
  env: {
    region: "me-south-1"
  }
});
