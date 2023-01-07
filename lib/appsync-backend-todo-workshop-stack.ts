import * as cdk from 'aws-cdk-lib';
import { RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AccountRecovery, CfnUserPoolGroup, UserPool, UserPoolClient, VerificationEmailStyle } from 'aws-cdk-lib/aws-cognito';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';

export class AppsyncBackendTodoWorkshopStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Using L2 Construct
    const userPool = new UserPool(this, 'TodoUserPool', {
      selfSignUpEnabled: true,
      accountRecovery: AccountRecovery.PHONE_AND_EMAIL,
      userVerification: {
        emailStyle: VerificationEmailStyle.CODE
      },
      autoVerify: {
        email: true
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true
        }
      }
    });

    // Using L1 Construct as adding user group is not supported by L2 Construct
    const userPoolAdminGroup = new CfnUserPoolGroup(this, 'TodoUserPoolAdminGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'Admin',
      description: 'Admin users for the Todo API'
    });

    const userPoolWebClient = new UserPoolClient(this, 'TodoUserPoolWebClient', {
      userPool
    });

    const todoDynamoDbTable = new Table(this, 'TodoDynamoDbTable', {
      removalPolicy: RemovalPolicy.DESTROY,
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'id',
        type: AttributeType.STRING
      }
    });
  }
}
