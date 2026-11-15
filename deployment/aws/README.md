# Deploy the ASTROGUARD demo review

Keep the website on GitHub Pages. The Lambda endpoint handles simulated
finding categories and uses its AWS role to call Amazon Nova Micro in Sydney.
The health monitor and Crew Suggestion work while the endpoint is unavailable.

In AWS CloudShell, select **Asia Pacific (Sydney)** and upload
`ASTROGUARD-Lambda.zip` using **Actions → Upload file**. Run:

```sh
unzip -o ASTROGUARD-Lambda.zip -d astroguard-lambda
cd astroguard-lambda
sam deploy --template-file template.yml --stack-name astroguard-ai-demo --region ap-southeast-2 --resolve-s3 --capabilities CAPABILITY_IAM
```

The AWS identity deploying the stack needs permission to create the stack's
Lambda function, DynamoDB table, code bucket and IAM role. The deployment uses
a public Lambda Function URL so GitHub Pages visitors can call it without AWS
accounts. The configured CORS origin limits which sites can read responses
from browser JavaScript. Other clients can still reach the endpoint.

The default cap is 20 Bedrock attempts across all visitors each UTC day.
Lambda records one reservation before inference. Provider failures consume
that reservation and quota storage failures stop inference. The cap applies
to Bedrock attempts. Lambda, DynamoDB and S3 usage are billed separately.
Set a different daily limit with `--parameter-overrides DailyLimit=10` if
needed. The table stores counters and expiry dates, with no visitor or mission
records.

Use the `ReviewUrl` deployment output for one synthetic smoke test:

```sh
curl -i -X POST 'PASTE_REVIEW_URL_HERE' \
  -H 'Origin: https://cx1801097.github.io' \
  -H 'Content-Type: application/json' \
  --data '{"source":"simulated","severity":"NORMAL","findings":[{"kind":"no_alert"}]}'
```

After an HTTP 200 with `"model":"amazon.nova-micro-v1:0"`, place `ReviewUrl`
in `data/cloud-ai-config.js` on the feature branch. Include the trailing
slash. Open a pull request to publish the button. It appears only in the
simulated Health Monitoring System on the public demo. Measured crew records,
notes, names and raw readings are excluded from the cloud request.

To rebuild the Lambda package locally, run `npm ci --ignore-scripts` in the
repository root. Create `function.zip` with `gemini.js`, `bedrock.js`,
`deployment/aws/handler.js` and `node_modules/` at their repository-relative
paths. Place the ZIP next to `template.yml`. Use `node --test` for local
validation.
