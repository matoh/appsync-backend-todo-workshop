import * as cdk from 'aws-cdk-lib';
import { CfnOutput, Duration, Expiration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  AccountRecovery,
  CfnUserPoolGroup,
  CfnUserPoolUICustomizationAttachment,
  UserPool,
  UserPoolClient,
  UserPoolDomain,
  VerificationEmailStyle
} from 'aws-cdk-lib/aws-cognito';

import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';
import { AuthorizationType, FieldLogLevel, GraphqlApi, MappingTemplate, PrimaryKey, SchemaFile, Values } from '@aws-cdk/aws-appsync-alpha';
import * as fs from 'fs';

export class AppsyncBackendTodoWorkshopStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Using L2 Construct
    const userPool = new UserPool(this, 'TodoUserPool', {
      selfSignUpEnabled: false,
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

    const userPoolDomain = new UserPoolDomain(this, 'TodoUserPoolDomain', {
      userPool,
      cognitoDomain: {
        domainPrefix: process.env.COGNITO_DOMAIN_PREFIX || ''
      }
    });

    // Using L1 Construct as adding user group is not supported by L2 Construct
    const userPoolAdminGroup = new CfnUserPoolGroup(this, 'TodoUserPoolAdminGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'Admin',
      description: 'Admin users for the Todo API'
    });

    const userPoolWebClient = new UserPoolClient(this, 'TodoUserPoolWebClient', {
      userPool,
      generateSecret: true,
      oAuth: {
        callbackUrls: ['http://localhost:3000/api/auth/callback/cognito'],
        logoutUrls: ['http://localhost:3000'],
        flows: {
          authorizationCodeGrant: true
        }
      }
    });

    const cfnUserPoolUICustomizationAttachment = new CfnUserPoolUICustomizationAttachment(this, 'MyCfnUserPoolUICustomizationAttachment', {
      clientId: userPoolWebClient.userPoolClientId,
      userPoolId: userPool.userPoolId,
      css: Buffer.from(fs.readFileSync('./assets/aws-cognito-login.css')).toString('utf-8')
      // // Not supported yet, more details: https://github.com/aws/aws-cdk/issues/6953
      // imageFile: Buffer.from(fs.readFileSync('./assets/stackZone.jpg')),
    });

    const todoDynamoDbTable = new Table(this, 'TodoDynamoDbTable', {
      removalPolicy: RemovalPolicy.DESTROY,
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'id',
        type: AttributeType.STRING
      }
    });

    const appSyncApi = new GraphqlApi(this, 'TodoAppSyncApi', {
      name: 'TodoAppSyncApi',
      schema: SchemaFile.fromAsset(path.join(__dirname, 'schema.graphql')),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool
          }
        },
        additionalAuthorizationModes: [
          {
            authorizationType: AuthorizationType.API_KEY,
            apiKeyConfig: {
              name: 'Todo Api Key',
              description: 'Simple API Key for fetching TODO tasks',
              expires: Expiration.after(Duration.days(30))
            }
          }
        ]
      },
      logConfig: {
        fieldLogLevel: FieldLogLevel.ALL
      },
      xrayEnabled: true
    });

    // Query: GetTodo
    appSyncApi.addDynamoDbDataSource('TodoDynamoDbQueryGetTodo', todoDynamoDbTable).createResolver('TodoDynamoDbQueryGetTodoResolver', {
      typeName: 'Query',
      fieldName: 'getTodo',
      requestMappingTemplate: MappingTemplate.dynamoDbGetItem('id', 'id'),
      responseMappingTemplate: MappingTemplate.dynamoDbResultItem()
    });

    // Query: ListTodos
    appSyncApi.addDynamoDbDataSource('TodoDynamoDbQueryListTodos', todoDynamoDbTable).createResolver('TodoDynamoDbQueryListTodoResolver', {
      typeName: 'Query',
      fieldName: 'listTodos',
      requestMappingTemplate: MappingTemplate.dynamoDbScanTable(),
      responseMappingTemplate: MappingTemplate.dynamoDbResultList()
    });

    // Mutation: AddTodo
    appSyncApi.addDynamoDbDataSource('TodoTableMutationAddTodo', todoDynamoDbTable).createResolver('TodoDynamoDbMutationAddTodoResolver', {
      typeName: 'Mutation',
      fieldName: 'addTodo',
      requestMappingTemplate: MappingTemplate.dynamoDbPutItem(PrimaryKey.partition('id').auto(), Values.projecting('input')),
      responseMappingTemplate: MappingTemplate.dynamoDbResultItem()
    });

    // Mutation: UpdateTodo
    appSyncApi
      .addDynamoDbDataSource('TodoTableMutationUpdateTodo', todoDynamoDbTable)
      .createResolver('TodoDynamoDbMutationUpdateTodoResolver', {
        typeName: 'Mutation',
        fieldName: 'updateTodo',
        requestMappingTemplate: MappingTemplate.dynamoDbPutItem(PrimaryKey.partition('id').is('input.id'), Values.projecting('input')),
        responseMappingTemplate: MappingTemplate.dynamoDbResultItem()
      });

    // Mutation: DeleteTodo
    appSyncApi
      .addDynamoDbDataSource('TodoTableMutationDeleteTodo', todoDynamoDbTable)
      .createResolver('TodoDynamoDbMutationDeleteTodoResolver', {
        typeName: 'Mutation',
        fieldName: 'deleteTodo',
        requestMappingTemplate: MappingTemplate.dynamoDbDeleteItem('id', 'id'),
        responseMappingTemplate: MappingTemplate.dynamoDbResultItem()
      });

    // Export variables needed for FrontEnd
    // Pool Id
    new CfnOutput(this, 'TodoUserPoolId', {
      value: userPool.userPoolId,
      description: 'Todo User Pool Id'
    });

    // Pool Provider Url
    new CfnOutput(this, 'TodoUserPoolProviderUrl', {
      value: userPool.userPoolProviderUrl,
      description: 'Todo User Pool Provider Url'
    });

    // Client Pool Id
    new CfnOutput(this, 'TodoUserPoolClientId', {
      value: userPoolWebClient.userPoolClientId,
      description: 'Todo User Client Pool Client Id'
    });

    // GraphQl Api Key
    new CfnOutput(this, 'TodoGraphQlApiKey', {
      value: appSyncApi.apiKey as string,
      description: 'Todo GraphQl Api Key'
    });

    // GraphQl Api Id
    new CfnOutput(this, 'TodoGraphQlApiId', {
      value: appSyncApi.apiId,
      description: 'Todo GraphQl Api Id'
    });
  }
}
