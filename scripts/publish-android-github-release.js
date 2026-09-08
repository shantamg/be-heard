#!/usr/bin/env node

/**
 * Publishes the latest finished EAS Android APK to a stable GitHub release URL.
 *
 * Stable download URL:
 * https://github.com/shantamg/meet-without-fear/releases/download/android-beta-latest/meet-without-fear.apk
 */

const { execFileSync } = require('child_process');
const { mkdtempSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');

const repo = 'shantamg/meet-without-fear';
const tag = 'android-beta-latest';
const assetName = 'meet-without-fear.apk';

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'inherit'],
    ...options,
  });
}

function releaseExists() {
  try {
    run('gh', ['release', 'view', tag, '--repo', repo], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getRelease() {
  return JSON.parse(run('gh', ['api', `repos/${repo}/releases/tags/${tag}`]));
}

function deleteAsset(asset) {
  console.log(`Deleting existing ${asset.name} release asset...`);
  run('gh', ['api', '--method', 'DELETE', `repos/${repo}/releases/assets/${asset.id}`], {
    stdio: 'inherit',
  });
}

function deleteExistingAsset(release, name) {
  const existingAsset = release.assets?.find((asset) => asset.name === name);

  if (!existingAsset) {
    return;
  }

  deleteAsset(existingAsset);
}

function deleteAssetsByPrefix(release, prefix) {
  const existingAssets = release.assets?.filter((asset) => asset.name.startsWith(prefix)) ?? [];

  for (const asset of existingAssets) {
    deleteAsset(asset);
  }
}

function renameAsset(assetId, name) {
  console.log(`Renaming uploaded asset to ${name}...`);
  run('gh', ['api', '--method', 'PATCH', `repos/${repo}/releases/assets/${assetId}`, '-f', `name=${name}`], {
    stdio: 'inherit',
  });
}

function uploadAsset(release, artifactPath, name) {
  const uploadUrl = release.upload_url.replace('{?name,label}', `?name=${name}`);
  const token = run('gh', ['auth', 'token']).trim();
  const curlConfigPath = join(mkdtempSync(join(tmpdir(), 'mwf-github-upload-')), 'curl.conf');

  writeFileSync(
    curlConfigPath,
    [
      `header = "Authorization: Bearer ${token}"`,
      'header = "Accept: application/vnd.github+json"',
      'header = "Content-Type: application/vnd.android.package-archive"',
    ].join('\n')
  );

  const response = run(
    'curl',
    [
      '--config',
      curlConfigPath,
      '--http1.1',
      '--fail',
      '--location',
      '--request',
      'POST',
      '--data-binary',
      `@${artifactPath}`,
      uploadUrl,
    ]
  );

  return JSON.parse(response);
}

console.log('Looking up latest finished Android APK build in EAS...');

const buildsJson = run(
  'npx',
  ['eas-cli', 'build:list', '--platform', 'android', '--limit', '10', '--json', '--non-interactive'],
  { cwd: join(__dirname, '..', 'mobile') }
);

const latestBuild = JSON.parse(buildsJson).find(
  (build) => build.status === 'FINISHED' && build.artifacts?.applicationArchiveUrl
);

if (!latestBuild) {
  console.error('No finished Android APK build with an artifact URL was found.');
  process.exit(1);
}

const artifactUrl = latestBuild.artifacts.applicationArchiveUrl;
const artifactPath = join(mkdtempSync(join(tmpdir(), 'mwf-android-')), assetName);

console.log(`Downloading EAS artifact for versionCode ${latestBuild.appBuildVersion}...`);
run('curl', ['--fail', '--location', '--output', artifactPath, artifactUrl], { stdio: 'inherit' });

if (!releaseExists()) {
  console.log(`Creating GitHub release ${tag}...`);
  run(
    'gh',
    [
      'release',
      'create',
      tag,
      '--repo',
      repo,
      '--title',
      'Android beta latest',
      '--notes',
      'Stable Android APK download for the website beta download page.',
    ],
    { stdio: 'inherit' }
  );
}

const release = getRelease();
const temporaryAssetName = `${assetName}.tmp-${Date.now()}`;

deleteAssetsByPrefix(release, `${assetName}.tmp-`);

console.log(`Uploading ${temporaryAssetName} to GitHub release ${tag}...`);
const uploadedAsset = uploadAsset(release, artifactPath, temporaryAssetName);

deleteExistingAsset(getRelease(), assetName);
renameAsset(uploadedAsset.id, assetName);

console.log(
  `Published https://github.com/${repo}/releases/download/${tag}/${assetName}`
);
