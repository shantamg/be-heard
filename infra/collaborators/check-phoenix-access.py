#!/usr/bin/env python3
"""Check effective Phoenix IAM permissions without mutating production resources."""
import json
import os
import subprocess

ACCOUNT = '679575633563'
PRODUCTION = f'arn:aws:lightsail:us-west-2:{ACCOUNT}:Instance/2ec640a2-7c02-439a-84b3-c305db779398'
SANDBOX = f'arn:aws:lightsail:us-west-2:{ACCOUNT}:Instance/permission-simulation'
BACKUPS = f'arn:aws:s3:::mwf-api-backups-{ACCOUNT}-us-west-2'
OWN_BUCKET = f'arn:aws:s3:::mwf-phoenix-sandbox-{ACCOUNT}-us-west-2'
PROFILE = os.environ.get('AWS_PROFILE', 'jason')

def check(name, action, resource, expected, context=None):
    entries = [{'ContextKeyName': key, 'ContextKeyValues': [value], 'ContextKeyType': 'string'}
               for key, value in (context or {}).items()]
    command = ['aws', '--profile', PROFILE, 'iam', 'simulate-principal-policy',
               '--policy-source-arn', f'arn:aws:iam::{ACCOUNT}:user/phoenix',
               '--action-names', action, '--resource-arns', resource, '--output', 'json']
    if entries:
        command += ['--context-entries', json.dumps(entries)]
    result = json.loads(subprocess.check_output(command, text=True))['EvaluationResults'][0]
    decision = result['EvalDecision']
    assert (decision == 'allowed') == expected, (name, decision, result.get('MissingContextValues'))
    print(f'{name}: {decision}')

request = {'aws:RequestedRegion': 'us-west-2', 'aws:RequestTag/Owner': 'phoenix',
           'aws:RequestTag/Project': 'meet-without-fear', 'aws:RequestTag/Environment': 'sandbox'}
owned = {'aws:RequestedRegion': 'us-west-2', 'aws:ResourceTag/Owner': 'phoenix',
         'aws:ResourceTag/Project': 'meet-without-fear', 'aws:ResourceTag/Environment': 'sandbox'}
check('Create tagged staging instance', 'lightsail:CreateInstances', '*', True, request)
check('Create untagged instance', 'lightsail:CreateInstances', '*', False, {'aws:RequestedRegion': 'us-west-2'})
check('Manage owned instance', 'lightsail:DeleteInstance', SANDBOX, True, owned)
check('Manage another collaborator instance', 'lightsail:DeleteInstance', SANDBOX, False, {**owned, 'aws:ResourceTag/Owner': 'someone-else'})
check('Delete production', 'lightsail:DeleteInstance', PRODUCTION, False, owned)
check('SSH to production', 'lightsail:GetInstanceAccessDetails', PRODUCTION, False, owned)
check('Relabel production', 'lightsail:TagResource', PRODUCTION, False, {**request, **owned})
check('Adopt untagged resource', 'lightsail:TagResource', SANDBOX, False, request)
check('Read backup', 's3:GetObject', BACKUPS + '/preserved/example/database.dump', True)
check('Read production secrets', 's3:GetObject', BACKUPS + '/configuration/20260908-completed-host.tar.gz', False)
check('Modify production deployment', 's3:PutObject', BACKUPS + '/releases/control/desired.json', False)
check('Write staging data', 's3:PutObject', OWN_BUCKET + '/staging/example', True)
check('Read unrelated data', 's3:GetObject', 'arn:aws:s3:::lovely-audio-prod/example', False)
check('Create IAM user', 'iam:CreateUser', f'arn:aws:iam::{ACCOUNT}:user/another-user', False)
check('Escalate own policy', 'iam:AttachUserPolicy', f'arn:aws:iam::{ACCOUNT}:user/phoenix', False)
check('Rotate another user key', 'iam:CreateAccessKey', f'arn:aws:iam::{ACCOUNT}:user/jason', False)
check('Invoke Bedrock', 'bedrock:InvokeModel', 'arn:aws:bedrock:us-west-2::foundation-model/amazon.titan-embed-text-v2:0', True)
