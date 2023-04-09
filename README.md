# Welcome to AppSync Backend Todo Workshop

Following services for the backend are used:
* AWS CDK
* AWS AppSync
* AWS DynamoDB
* AWS Cognito

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template
* `cdk destroy`     delete this stack

## Prerequisites
Create `.env` file as a copy of `.env.example` and fill AWS secrets.  

## Manual configuration after deployment

### Add custom logo for AWS Cognito hosted UI 
As CDK does not support yet logo for hosted UI, it needs to be added manually.