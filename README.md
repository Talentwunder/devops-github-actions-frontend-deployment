# TW S3 & CloudFront Deployment GitHub Action 

**Disclaimer**
If you want to update the code in `index.js`, make sure to commit the bundle as well after running `yarn package`.

This action syncs the `build` folder to S3, updates the CloudFront distribution and 
creates a new release on Sentry.

The version will be pulled from the `version` prop in `package.json`.

## Inputs

### `distributionId`

**Required** The CloudFront distribution id that should be updated

### `bucketName`

**Required** Bucket name where the application build should be synced to

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
  bucketName: 'app.talentwunder.com'
  environment: 'prod'
  sentryProject: 'my-sentry-project-name'
  sentryPrefix: 'fe'
env:
  AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
  AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
  SENTRY_IO: ${{ secrets.SENTRY_IO }}
```

Note that you need to make sure AWS credentials are available as environment variables.
