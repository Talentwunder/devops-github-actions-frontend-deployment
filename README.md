# TW S3 & CloudFront Deployment GitHub Action 

This action syncs the `build` folder to S3, updates the CloudFront distribution and 
creates a new release on Sentry.

The version will be pulled from the `version` prop in `package.json`.

## Inputs

### `distributionId`

**Required** The CloudFront distribution id that should be updated

### `s3BucketName`

**Required** Bucket name where the application build should be synced to

### `applicationUrl`

**Required** URL of how the application is reachable, e.g. "https://dev.talentwunder.com"

### `environment`

**Required** The referenced environment for the deployment
Supported values:
 - `dev`
 - `beta`
 - `prod`
 
### `sentryProject`

**Required** Defines the name of the Sentry project, e.g. `saas-frontend`.
 
### `sentryPrefix`
  
**Required** Defines how a sentry release should be prefixed, e.g. "fe"

## Example usage

```yaml
uses: Talentwunder/devops-github-actions-frontend-deployment@master
with:
  distributionId: 'abcdefg'
  s3BucketName: 'app.talentwunder.com'
  applicationUrl: 'app.talentwunder.com'
  environment: 'prod'
  sentryProject: 'my-sentry-project-name'
  sentryPrefix: 'fe'
env:
  AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
  AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

Note that you need to make sure AWS credentials are available as environment variables.
