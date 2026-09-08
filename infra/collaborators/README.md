# Phoenix: AWS access for staging

Phoenix has IAM user `phoenix` in account `679575633563` (`shantamg`), region `us-west-2`. The operator created a CLI access key and a console login that requires a password change. Credentials are delivered privately, never committed here. Enable MFA in the console's Security credentials page after first login.

This access is for deploying a separate hosted version of MWF when it is ready. Local Docker/PostgreSQL development does not require AWS. No second server or database has been provisioned as part of account setup.

## Access

| Resource | Permission |
| --- | --- |
| Bedrock | Discover models/profiles and invoke models, including streaming and cross-region inference profiles |
| Lightsail | View instance metadata; create servers and managed databases in Oregon with the required staging tags; manage, delete, change firewall rules, and obtain SSH access for his own tagged resources |
| `mwf-phoenix-sandbox-679575633563-us-west-2` | Read/write/delete objects, including Terraform state; private, encrypted and versioned |
| Production backup bucket | Read `nightly/`, `preserved/`, and `releases/artifacts/` only |
| Production Terraform state | Read `production/terraform.tfstate` only |
| Production runtime/other projects | No server administration, deploy control writes, production configuration-secret downloads, or unrelated S3 object access |
| IAM | Manage only his own password, MFA devices and access keys; no policy/role/user administration |

S3 bucket names are visible for console navigation, but that does not grant access to their objects. Production backups contain application data; copy them only when the staging work needs that data. Start with a fresh database otherwise.

Lightsail creation requests must include all three tags:

```text
Project=meet-without-fear
Owner=phoenix
Environment=sandbox
```

`Environment=sandbox` is the access-control label for Phoenix's staging resources. It must match exactly. He cannot relabel production or adopt an untagged existing resource. Static-IP allocation, production DNS, new IAM runtime identities, Vercel membership, and Clerk administration are separate setup steps when the staging deployment is ready. A new instance can initially use its assigned public IP; that IP may change after a stop/start.

## CLI setup

Merge the privately supplied sections into `~/.aws/credentials` and `~/.aws/config`, preserving existing profiles. Keep both files private (`chmod 600`). Then:

```bash
aws --profile mwf-phoenix sts get-caller-identity
aws --profile mwf-phoenix --region us-west-2 lightsail get-instances
aws --profile mwf-phoenix --region us-west-2 bedrock list-foundation-models
aws --profile mwf-phoenix s3 ls s3://mwf-phoenix-sandbox-679575633563-us-west-2/
aws --profile mwf-phoenix s3 ls s3://mwf-api-backups-679575633563-us-west-2/preserved/
```

The console is `https://shantamg.signin.aws.amazon.com/console/`, username `phoenix`.

## When ready to host staging

A full staging deployment needs its own backend process, PostgreSQL database, frontend API URL, authentication configuration and hostname. A second database alone does not provide a second running application. A separate Lightsail instance isolates deployment changes and resource use from the current 2 GB production server.

Use a separate infrastructure directory/state file. Do not apply `infra/aws/` as Phoenix: it owns production and its GitHub OIDC/deployment resources. Use the dedicated staging bucket with a unique state key such as `terraform/staging/terraform.tfstate` and S3 lockfiles. Add the required tags to Terraform provider defaults or every resource creation request.

An example future server launch (creates a billable server when executed):

1. Create a tagged Lightsail SSH key pair and keep its returned private key securely on your machine. The `CreateKeyPair` API accepts the same three tags above. Do not put the private key in Terraform state or Git.
2. Create the server using the key pair's name:

```bash
aws --profile mwf-phoenix --region us-west-2 lightsail create-instances \
  --instance-names mwf-phoenix-stage \
  --availability-zone us-west-2a \
  --blueprint-id ubuntu_24_04 \
  --bundle-id small_3_0 \
  --key-pair-name YOUR_TAGGED_KEY_PAIR_NAME \
  --tags key=Project,value=meet-without-fear key=Owner,value=phoenix key=Environment,value=sandbox
```

3. Restrict SSH to your IP. Install Docker and use an independent Compose stack/database volume with fresh database credentials. PostgreSQL can run on that same staging server, so a managed database is optional. Match PostgreSQL 18 and pgvector if reusing the current migrations; create the vector extension before running them with a non-superuser application role. Run `prisma migrate deploy` to initialize the fresh application schema. Keep port 5432 private.
4. Select the new version's app image and configure its integrations. The production Compose/Caddy files are reference material: they contain the production hostname and must not be copied unchanged for staging. Coordinate a staging hostname, CORS, a suitable Clerk instance, frontend API URL, and a separate limited runtime AWS identity. Do not install the collaborator's broad CLI key in the hosted app.
5. Deploy and verify staging independently. Leave the existing production DNS, deployment manifest and database unchanged.

The production-sized `small_3_0` server is approximately $12/month when provisioned; S3 and Bedrock usage are additional. Account setup itself did not create a paid compute resource.

## Validation and maintenance

`phoenix-policy.json` and `phoenix-self-service.json` match the installed managed policies `MWFPhoenixDevelopment` and `MWFPhoenixSelfService`. Policy changes are operator-managed; Phoenix cannot edit or attach policies.

Validation performed at setup:

- AWS IAM Access Analyzer reported no findings for either policy.
- Effective-policy simulation allowed tagged staging creation and denied production deletion/SSH/tag changes, adoption of untagged resources, production secret reads/deploy writes, unrelated S3 reads and IAM escalation.
- Phoenix's actual key authenticated, listed Lightsail/Bedrock resources, created/deleted a tagged Lightsail key pair, read backup metadata, wrote/read/deleted an object in his bucket, and invoked Bedrock successfully.
- No server/database was created for these checks.

An operator can rerun the effective-policy checks:

```bash
AWS_PROFILE=jason python3 infra/collaborators/check-phoenix-access.py
```

Revoke Phoenix's credentials and detach his policies if access is no longer needed. Review staging data before deleting his versioned bucket; deleting a versioned object can leave old versions behind.
