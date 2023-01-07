import * as cdk from 'aws-cdk-lib';
import { Duration, Expiration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AccountRecovery, CfnUserPoolGroup, UserPool, UserPoolClient, VerificationEmailStyle } from 'aws-cdk-lib/aws-cognito';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';
import { AuthorizationType, FieldLogLevel, GraphqlApi, MappingTemplate, PrimaryKey, SchemaFile, Values } from '@aws-cdk/aws-appsync-alpha';

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
  }
}
