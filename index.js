const core = require('@actions/core');
const exec = require('@actions/exec');
const glob = require('@actions/glob');
const io = require('@actions/io');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { CloudFront } = require('aws-sdk');
const FormData = require('form-data');

const cloudFront = new CloudFront({ region: 'eu-central-1' });

const SENTRY_API_TOKEN = process.env.SENTRY_IO;

function getSentryVersion(prefix, version, environment) {
    return `${prefix}-${version}-${environment}`;
}

/**
 * @param sentryVersion {string}
 * @return {Promise<boolean>}
 */
async function doesSentryReleaseExist(sentryVersion) {
    console.log('Checking if release in sentry exists');
    try {
        await axios({
            method: 'GET',
            url: `https://sentry.io/api/0/organizations/talentwunder/releases/${sentryVersion}/`,
            headers: {
                Authorization: `Bearer ${SENTRY_API_TOKEN}`
            }
        });
        console.log('There is already a release.');
        return true
    } catch (e) {
        console.log('No release for version yet.', e.message);
        return false
    }
}

async function createSentryRelease(sentryProject, sentryVersion) {
    console.log('Creating a new release in Sentry for version', sentryVersion);
    try {
        const response = await axios({
            method: 'POST',
            url: 'https://sentry.io/api/0/organizations/talentwunder/releases/',
            headers: {
                Authorization: `Bearer ${SENTRY_API_TOKEN}`
            },
            data: {
                version: sentryVersion,
                projects: [ sentryProject ],
            }
        })
        console.log('Sentry release created', JSON.stringify(response.data, null, 2));
    } catch (e) {
        console.error('Could not create release');
        console.error(JSON.stringify(e));
    }
}

/**
 *
 * @param sentryVersion {string}
 * @return {Promise<void>}
 */
async function deleteReleaseFilesInSentry(sentryVersion) {
    console.log('Listing files...');
    const { data: files } = await axios({
        method: 'GET',
        url: `https://sentry.io/api/0/organizations/talentwunder/releases/${sentryVersion}/files/`,
        headers: {
            Authorization: `Bearer ${SENTRY_API_TOKEN}`
        }
    })
    console.log('Deleting a total of', files.length, 'files...');
    await Promise.all(files.map(file => axios({
        method: 'DELETE',
        url: `https://sentry.io/api/0/organizations/talentwunder/releases/${sentryVersion}/files/${file.id}/`,
        headers: {
            Authorization: `Bearer ${SENTRY_API_TOKEN}`
        }
    })))
    console.log('Release files deleted!');
}

/**
 *
 * @param sentryProject {string}
 * @param sentryVersion {string}
 * @return {Promise<void>}
 */
async function uploadSentrySourceMaps(sentryProject, sentryVersion) {
    console.log('Uploading source maps to Sentry...');
    const globber = await glob.create(path.resolve('build/static/js/*.js.map'))

    for await (const file of globber.globGenerator()) {
        console.log('File: ', file);
        const formData = new FormData();
        formData.append('file', fs.createReadStream(file));
        formData.append('name', `~/static/js/${path.basename(file)}`)

        try {
            await axios({
                method: 'POST',
                url: `https://sentry.io/api/0/projects/talentwunder/${sentryProject}/releases/${sentryVersion}/files/`,
                headers: {
                    Authorization: `Bearer ${SENTRY_API_TOKEN}`,
                    ...formData.getHeaders()
                },
                data: formData,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            })
        } catch (e) {
            console.error('Failed to upload source map\n', JSON.stringify(e));
            throw e
        }
        console.log('Source map uploaded: ', file);
        await io.rmRF(file)
        console.log('Source map removed');
    }
}

/**
 * Take everything from the "build" directory and move it into S3.
 * Note that "index.html" should not be cached.
 * @param bucketName {string}
 * @param version {string}
 */
async function syncS3Bucket(bucketName, version) {
    console.log('Syncing the build directory to S3');

    const bucketPath = `${bucketName}/v${version}`;
    console.log('Destination S3 is located at: ', bucketPath);

    await exec.exec(`aws s3 sync build/ s3://${bucketPath} --delete --exclude index.html`);
    console.log('Files uploaded.');

    await exec.exec(`aws s3 cp build/index.html s3://${bucketPath}/index.html --metadata-directive REPLACE --cache-control max-age=0,no-cache,no-store,must-revalidate --content-type text/html`)
    console.log('Adding cache control to "index.html"');
}

/**
 *
 * @param distributionId {string}
 * @return {Promise<CloudFront.GetDistributionConfigResult>}
 */
async function getCloudFrontDistributionConfig(distributionId) {
    return await cloudFront.getDistributionConfig({
        Id: distributionId
    }).promise()
}

/**
 *
 * @param distributionId {string}
 * @param version {string}
 * @return {Promise<void>}
 */
async function updateCloudFrontDistribution(distributionId, version) {
    console.log('Fetching existing CloudFront distribution');
    const { DistributionConfig, ETag } = await getCloudFrontDistributionConfig(distributionId);
    console.log(JSON.stringify(DistributionConfig, null, 2));

    console.log('Adjusting the origin path to account for the new version');
    DistributionConfig.Origins.Items[0].OriginPath = `/v${version}`;

    console.log('Updating the distribution...');
    await cloudFront.updateDistribution({
        Id: distributionId,
        DistributionConfig: DistributionConfig,
        IfMatch: ETag
    }).promise()
    console.log('CloudFront distribution updated!');
}


async function run() {
    try {
        console.log('Starting deployment to S3 and CloudFront');

        const cloudFrontDistributionId = core.getInput('distributionId');
        const s3BucketName = core.getInput('bucketName');
        const environment = core.getInput('environment');
        const sentryProject = core.getInput('sentryProject');
        const sentryVersionPrefix = core.getInput('sentryPrefix');

        console.log('Distribution ID: ', cloudFrontDistributionId);
        console.log('Bucket name: ', s3BucketName);
        console.log('Environment: ', environment);
        console.log('Sentry project: ', sentryProject);

        console.log('Reading version from "package.json"');
        const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
        console.log('Version: ', version);

        const sentryVersion = getSentryVersion(sentryVersionPrefix, version, environment);

        const hasRelease = await doesSentryReleaseExist(sentryVersion);
        if (hasRelease) {
            await deleteReleaseFilesInSentry(sentryVersion);
        }
        await createSentryRelease(sentryProject, sentryVersion)
        await uploadSentrySourceMaps(sentryProject, sentryVersion);

        await syncS3Bucket(s3BucketName, version);
        await updateCloudFrontDistribution(cloudFrontDistributionId, version);

        console.log('All done!');
    } catch (e) {
        core.setFailed(e.message);
    }
}

run();
