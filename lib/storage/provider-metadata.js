/**
 * Canonical metadata, fields, and step-by-step instructions for all supported storage providers.
 */
export const PROVIDER_METADATA = {
  r2: {
    id: 'r2',
    name: 'Cloudflare R2',
    shortDesc: 'Zero egress fees, ultra-fast global distribution, and generous free tier (10 GB free storage).',
    dashboardUrl: 'https://dash.cloudflare.com',
    fields: ['name', 'accountId', 'bucket', 'accessKey', 'secretKey'],
    defaults: { region: 'auto' },
    corsPolicy: `[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Type", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]`,
    steps: [
      {
        title: 'Open Cloudflare Dashboard',
        description: 'Log in to your Cloudflare dashboard and click on "R2 Object Storage" in the left sidebar.',
      },
      {
        title: 'Create an R2 Bucket',
        description: 'Click "Create bucket", choose a unique name (e.g. "my-panda-vault"), and click "Create Bucket".',
      },
      {
        title: 'Copy Account ID',
        description: 'On the R2 overview page, locate and copy your "Account ID" from the right sidebar.',
      },
      {
        title: 'Generate API Access Token',
        description: 'Click "Manage R2 API Tokens" -> "Create API Token". Set permissions to "Object Read & Write" and specify your bucket.',
      },
      {
        title: 'Copy Keys & Paste into Panda',
        description: 'Copy your "Access Key ID" and "Secret Access Key". Return to Panda and paste your Account ID, Bucket, and Keys.',
      },
    ],
  },
  b2: {
    id: 'b2',
    name: 'Backblaze B2',
    shortDesc: 'Affordable, high-durability cloud storage (10 GB free) with S3-compatible API.',
    dashboardUrl: 'https://secure.backblaze.com/b2_buckets.htm',
    fields: ['name', 'endpoint', 'bucket', 'region', 'accessKey', 'secretKey'],
    defaults: { region: 'us-west-004' },
    corsPolicy: `[
  {
    "corsRuleName": "pandaVaultPolicy",
    "allowedOrigins": ["*"],
    "allowedOperations": ["s3_get", "s3_put", "s3_delete", "s3_head", "s3_post"],
    "allowedHeaders": ["*"],
    "exposeHeaders": ["ETag"],
    "maxAgeSeconds": 3600
  }
]`,
    steps: [
      {
        title: 'Open Backblaze B2 Buckets',
        description: 'Log in to Backblaze and navigate to "B2 Cloud Storage" -> "Buckets".',
      },
      {
        title: 'Create a Private Bucket',
        description: 'Click "Create a Bucket", enter a globally unique name, and set bucket privacy to "Private".',
      },
      {
        title: 'Note Endpoint & Region',
        description: 'Under your bucket card on the Buckets page, copy the "Endpoint" (e.g. "s3.us-west-004.backblazeb2.com") and "Region" (e.g. "us-west-004").',
      },
      {
        title: 'Set Bucket CORS Rules',
        description: 'Under your bucket, click "Bucket Settings" -> scroll down to "CORS Rules" -> select "Share everything in this bucket with every origin" (or paste the JSON policy below).',
      },
      {
        title: 'Create Application Key',
        description: 'In the left menu, click "Application Keys" -> "Add a New Application Key". Select your bucket, set access to "Read and Write", and click Create.',
      },
      {
        title: 'Copy keyID & applicationKey',
        description: 'Copy your "keyID" (paste into Access Key ID) and "applicationKey" (paste into Secret Access Key).',
      },
    ],
  },
  s3: {
    id: 's3',
    name: 'Amazon S3',
    shortDesc: 'Industry standard 99.999999999% durability object storage across all AWS global regions.',
    dashboardUrl: 'https://s3.console.aws.amazon.com/s3',
    fields: ['name', 'bucket', 'region', 'accessKey', 'secretKey'],
    defaults: { region: 'us-east-1' },
    corsPolicy: `[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]`,
    steps: [
      {
        title: 'Open AWS S3 Console',
        description: 'Log in to AWS Management Console and open the Amazon S3 service.',
      },
      {
        title: 'Create an S3 Bucket',
        description: 'Click "Create bucket", enter a bucket name, select your AWS Region, and ensure "Block all public access" is checked.',
      },
      {
        title: 'Create IAM User for Panda',
        description: 'Go to AWS IAM -> "Users" -> "Create User" (e.g. "panda-vault-agent").',
      },
      {
        title: 'Attach S3 Permissions Policy',
        description: 'Attach policy granting S3 Read, Write, and Delete permissions to your specific bucket.',
      },
      {
        title: 'Create Access Key',
        description: 'Under the user\'s "Security credentials" tab, click "Create access key", copy the Access Key ID & Secret Access Key, and paste into Panda.',
      },
    ],
  },
  wasabi: {
    id: 'wasabi',
    name: 'Wasabi Hot Cloud',
    shortDesc: 'Predictable high-speed cloud object storage with no egress charges.',
    dashboardUrl: 'https://console.wasabisys.com',
    fields: ['name', 'endpoint', 'bucket', 'region', 'accessKey', 'secretKey'],
    defaults: { region: 'us-east-1', endpoint: 'https://s3.wasabisys.com' },
    corsPolicy: `[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]`,
    steps: [
      {
        title: 'Open Wasabi Console',
        description: 'Log in to Wasabi and navigate to "Buckets".',
      },
      {
        title: 'Create a Bucket',
        description: 'Click "Create Bucket", choose your region, and create a private bucket.',
      },
      {
        title: 'Generate Access Keys',
        description: 'Go to "Access Keys" -> "Create New Access Key" (Root or Sub-User).',
      },
      {
        title: 'Copy Credentials',
        description: 'Copy your Access Key, Secret Key, and region endpoint, then paste into Panda.',
      },
    ],
  },
  minio: {
    id: 'minio',
    name: 'MinIO (Self-Hosted)',
    shortDesc: 'Self-hosted high-performance S3-compatible object storage running on your own servers or NAS.',
    dashboardUrl: '',
    fields: ['name', 'endpoint', 'bucket', 'accessKey', 'secretKey'],
    defaults: {},
    corsPolicy: `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetBucketLocation",
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": ["arn:aws:s3:::*"]
    }
  ]
}`,
    steps: [
      {
        title: 'Open Your MinIO Console',
        description: 'Navigate to your self-hosted MinIO Web Console (e.g. "https://minio.yourdomain.com").',
      },
      {
        title: 'Create a Bucket',
        description: 'Go to "Buckets" -> "Create Bucket" and enter a bucket name.',
      },
      {
        title: 'Create an Access Key',
        description: 'Go to "Access Keys" -> "Create access key", note the Access Key and Secret Key.',
      },
      {
        title: 'Paste S3 API Endpoint & Keys',
        description: 'Enter your public HTTPS S3 endpoint URL (e.g. "https://s3.yourdomain.com"), bucket, and keys into Panda.',
      },
    ],
  },
  custom_s3: {
    id: 'custom_s3',
    name: 'Custom S3-Compatible',
    shortDesc: 'Connect any S3-compliant provider including DigitalOcean Spaces, Scaleway, Linode, or Storj.',
    dashboardUrl: '',
    fields: ['name', 'endpoint', 'bucket', 'region', 'accessKey', 'secretKey'],
    defaults: {},
    corsPolicy: `[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]`,
    steps: [
      {
        title: 'Create Bucket on Your Provider',
        description: 'Log in to your provider (DigitalOcean Spaces, Scaleway, Linode Object Storage, etc.) and create a bucket.',
      },
      {
        title: 'Obtain S3 Endpoint & Region',
        description: 'Copy the S3 API endpoint URL (e.g. "https://nyc3.digitaloceanspaces.com") and region.',
      },
      {
        title: 'Generate API Keys',
        description: 'Generate an Access Key (Key ID) and Secret Key with Read & Write permissions on the bucket.',
      },
      {
        title: 'Paste into Panda',
        description: 'Paste your Endpoint URL, Bucket Name, Region, Access Key, and Secret Key into Panda.',
      },
    ],
  },
};
