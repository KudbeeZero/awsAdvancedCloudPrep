import { PracticeScenario } from './types';

export const PRACTICE_SCENARIOS: PracticeScenario[] = [
  {
    id: 'scen-1',
    title: 'Serverless Event-Driven Image Processing',
    domain: 'domain-3',
    category: 'Compute & Storage',
    prompt:
      'A media startup lets users upload profile photos directly to Amazon S3. Immediately after upload, a resize function must generate 3 thumbnails. Uploads occur in unpredictable spikes with zero traffic overnight.',
    constraints: ['Zero idle cost', 'Automatic scaling', 'No server patching'],
    options: [
      {
        id: 'a',
        label: 'S3 Event Notification triggering AWS Lambda',
        rationale:
          'Optimal. S3 triggers Lambda automatically per upload; Lambda scales to thousands of concurrent executions and costs $0 when idle.',
      },
      {
        id: 'b',
        label: 'Always-on t3.medium EC2 instance polling S3 every 5 seconds',
        rationale:
          'Inefficient. You pay 24/7 even with zero overnight traffic, plus you must patch the OS and manage scaling manually.',
      },
      {
        id: 'c',
        label: 'Amazon Redshift scheduled COPY job',
        rationale:
          'Incorrect tool. Redshift is a columnar OLAP data warehouse for SQL analytics, not image transformation.',
      },
    ],
    correctOptionId: 'a',
    architecturalTakeaway:
      'Event-driven serverless pipelines (S3 + Lambda) embody Cost Optimization and Performance Efficiency by eliminating idle compute.',
  },
  {
    id: 'scen-2',
    title: '7-Year Regulatory Compliance Archive',
    domain: 'domain-3',
    category: 'Storage Optimization',
    prompt:
      'A regional hospital must retain 400 TB of patient audit logs for 7 years to satisfy regulations. The logs are almost never accessed, and if an audit occurs, a 12-to-48-hour retrieval window is acceptable.',
    constraints: ['Lowest storage cost per GB', '11 nines durability', '12–48 hr retrieval OK'],
    options: [
      {
        id: 'a',
        label: 'Amazon S3 Standard with Versioning',
        rationale:
          'Too expensive. S3 Standard is priced for frequent millisecond access, costing roughly 23x more than Deep Archive.',
      },
      {
        id: 'b',
        label: 'Amazon S3 Glacier Deep Archive via Lifecycle Policy',
        rationale:
          'Optimal. S3 Glacier Deep Archive offers the lowest cost storage in AWS (~$0.00099/GB/mo) with 11 9s durability and 12–48 hr restore options.',
      },
      {
        id: 'c',
        label: 'Amazon EFS Infrequent Access',
        rationale:
          'Not cost-optimal. EFS is a mounted POSIX file system for active Linux compute, much costlier than Glacier Deep Archive for cold 7-year archives.',
      },
    ],
    correctOptionId: 'b',
    architecturalTakeaway:
      'Match S3 storage classes to access frequency and retrieval SLA: Glacier Deep Archive wins for multi-year compliance retention.',
  },
  {
    id: 'scen-3',
    title: 'Interruptible Nightly Genomics Batch Pipeline',
    domain: 'domain-4',
    category: 'Cost Optimization',
    prompt:
      'A biotech lab runs massive genome alignment jobs that checkpoint progress every 5 minutes. If a compute node is reclaimed mid-job, another node can resume from the last checkpoint without issue.',
    constraints: ['Fault-tolerant / checkpointed', 'Up to 90% cost savings', 'Flexible completion window'],
    options: [
      {
        id: 'a',
        label: 'EC2 On-Demand Instances',
        rationale:
          'Missed savings. On-Demand is full list price for workloads that cannot tolerate interruption.',
      },
      {
        id: 'b',
        label: 'EC2 Spot Instances',
        rationale:
          'Optimal. Spot Instances tap spare EC2 capacity at up to 90% discount off On-Demand prices—ideal for stateless, checkpointed batch jobs.',
      },
      {
        id: 'c',
        label: 'EC2 Dedicated Hosts',
        rationale:
          'Wrong purpose. Dedicated Hosts provide single-tenant physical servers for strict per-socket licensing, at premium cost.',
      },
    ],
    correctOptionId: 'b',
    architecturalTakeaway:
      'Whenever an exam question mentions "fault-tolerant", "stateless", "batch", or "can tolerate a 2-minute interruption notice", choose EC2 Spot Instances.',
  },
  {
    id: 'scen-4',
    title: 'Least-Privilege S3 Access from EC2',
    domain: 'domain-2',
    category: 'Security & IAM',
    prompt:
      'An application running on an Amazon EC2 fleet needs read-only access to configuration files stored in a private Amazon S3 bucket. Security policy forbids storing static access keys on disk.',
    constraints: ['No hardcoded credentials', 'Automatic credential rotation', 'Least privilege'],
    options: [
      {
        id: 'a',
        label: 'Create an IAM User and place its Access Key ID in /etc/environment',
        rationale:
          'Anti-pattern! Long-lived static credentials on EC2 instances violate security best practices and risk exposure.',
      },
      {
        id: 'b',
        label: 'Attach an IAM Role (Instance Profile) with S3 read-only permissions to EC2',
        rationale:
          'Optimal. IAM Roles issue short-lived temporary credentials automatically via AWS STS and rotate them transparently.',
      },
      {
        id: 'c',
        label: 'Make the S3 bucket public and obscure the object filenames',
        rationale:
          'Critical security violation. Security by obscurity leaves data exposed to public enumeration.',
      },
    ],
    correctOptionId: 'b',
    architecturalTakeaway:
      'Always use IAM Roles for AWS compute services (EC2, Lambda, ECS) rather than embedding IAM User access keys.',
  },
  {
    id: 'scen-5',
    title: 'Blocking Known Malicious IPs at the Subnet Edge',
    domain: 'domain-2',
    category: 'VPC Networking',
    prompt:
      'Your security team observes automated brute-force traffic hitting a VPC subnet from three specific external IPv4 addresses and needs an explicit DENY rule at the subnet boundary.',
    constraints: ['Explicit DENY rule', 'Subnet-level enforcement', 'Immediate block'],
    options: [
      {
        id: 'a',
        label: 'Modify the VPC Security Group to add a DENY rule',
        rationale:
          'Impossible. Security Groups only support ALLOW rules—they cannot create explicit DENY rules.',
      },
      {
        id: 'b',
        label: 'Add explicit DENY rules for those IPs in the Network ACL (NACL)',
        rationale:
          'Optimal. NACLs operate at the subnet level, evaluate rules in ascending numerical order, and support explicit DENY rules.',
      },
      {
        id: 'c',
        label: 'Remove the Internet Gateway from the VPC',
        rationale:
          'Overly destructive. Detaching the IGW cuts off all legitimate public internet traffic to the entire VPC.',
      },
    ],
    correctOptionId: 'b',
    architecturalTakeaway:
      'Security Groups = Stateful, instance-level, Allow-only. Network ACLs = Stateless, subnet-level, Allow + Explicit Deny.',
  },
  {
    id: 'scen-6',
    title: 'Fast Offline Migration of 120 TB Research Dataset',
    domain: 'domain-1',
    category: 'Migration & Transfer',
    prompt:
      'A university lab needs to migrate 120 TB of seismic sensor archives to Amazon S3 within 10 days, but their facility only has a shared 20 Mbps internet uplink.',
    constraints: ['120 TB dataset', '20 Mbps link (~500+ days online)', 'Under 10 days'],
    options: [
      {
        id: 'a',
        label: 'Upload continuously over the internet using S3 Multipart Upload',
        rationale:
          'Physically impossible in 10 days. At 20 Mbps (~2.5 MB/s), transferring 120 TB would take over 550 days.',
      },
      {
        id: 'b',
        label: 'Order AWS Snowball Edge Storage Optimized devices',
        rationale:
          'Optimal. Snowball Edge ships rugged KMS-encrypted appliances directly to the lab for fast local 100 Gbps copy, then ships back to AWS for S3 ingestion.',
      },
      {
        id: 'c',
        label: 'Provision an AWS Direct Connect circuit tomorrow',
        rationale:
          'Too slow to provision. Direct Connect requires physical fiber installation with a carrier, typically taking weeks to months.',
      },
    ],
    correctOptionId: 'b',
    architecturalTakeaway:
      'When network bandwidth makes multi-terabyte uploads take weeks/months, AWS Snowball Edge bypasses the internet physically.',
  },
  {
    id: 'scen-7',
    title: 'Multi-Account Consolidated Billing & Guardrails',
    domain: 'domain-4',
    category: 'Billing & Governance',
    prompt:
      'An enterprise runs 18 separate AWS accounts across Engineering, Finance, and Marketing. The CFO wants one unified monthly invoice, pooled volume discounts, and a hard block preventing any developer from disabling CloudTrail.',
    constraints: ['Single unified bill', 'Pooled volume discounts', 'Account-wide guardrails'],
    options: [
      {
        id: 'a',
        label: 'AWS Organizations with Consolidated Billing and Service Control Policies (SCPs)',
        rationale:
          'Optimal. AWS Organizations merges billing for tiered volume discounts and enforces non-overridable maximum permissions via SCPs.',
      },
      {
        id: 'b',
        label: 'AWS Budgets with SNS notifications across each account',
        rationale:
          'Incomplete. Budgets alerts on spend thresholds, but does not merge invoices or block CloudTrail deletion.',
      },
      {
        id: 'c',
        label: 'AWS IAM Groups shared across all 18 accounts',
        rationale:
          'Invalid. IAM Users and Groups are scoped to a single AWS account and cannot span multiple accounts directly.',
      },
    ],
    correctOptionId: 'a',
    architecturalTakeaway:
      'Multi-account governance + unified invoicing + permission guardrails = AWS Organizations + SCPs.',
  },
  {
    id: 'scen-8',
    title: 'High Availability vs. Read Scaling on Amazon RDS',
    domain: 'domain-3',
    category: 'Database Architecture',
    prompt:
      'An e-commerce PostgreSQL database on Amazon RDS must automatically survive the complete loss of an Availability Zone with zero manual intervention and minimal data loss.',
    constraints: ['Automatic AZ failover', 'Synchronous replication', 'Managed SQL'],
    options: [
      {
        id: 'a',
        label: 'Enable Amazon RDS Multi-AZ deployment',
        rationale:
          'Optimal. RDS Multi-AZ maintains a synchronous standby replica in a separate Availability Zone and fails over DNS automatically in ~60 seconds.',
      },
      {
        id: 'b',
        label: 'Create an Amazon RDS Read Replica in the same Availability Zone',
        rationale:
          'Wrong tool. Read Replicas use asynchronous replication for scaling read queries, and placing one in the same AZ offers no AZ-failure protection.',
      },
      {
        id: 'c',
        label: 'Take hourly manual RDS Snapshots',
        rationale:
          'Slow recovery & data loss. Restoring a snapshot requires manual steps and loses up to 59 minutes of transactions.',
      },
    ],
    correctOptionId: 'a',
    architecturalTakeaway:
      'RDS Multi-AZ = High Availability & Disaster Recovery (synchronous). RDS Read Replica = Read Performance Scaling (asynchronous).',
  },
];
