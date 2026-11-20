import { AwsService, ExamDomain, SharedResponsibilityTask, SupportPlan } from './types';

export const EXAM_DOMAINS: ExamDomain[] = [
  {
    id: 'domain-1',
    number: '01',
    title: 'Cloud Concepts',
    weight: 24,
    summary:
      'Value proposition of the AWS Cloud, cloud economics, AWS Well-Architected Framework, and AWS Cloud Adoption Framework (CAF).',
    keyTopics: [
      '6 Advantages of Cloud Computing (CapEx to OpEx, economies of scale, agility)',
      'AWS Well-Architected Framework (6 Pillars)',
      'AWS Cloud Adoption Framework (6 Perspectives)',
      'Migration Strategies (7 Rs including Relocate)',
    ],
  },
  {
    id: 'domain-2',
    number: '02',
    title: 'Security and Compliance',
    weight: 30,
    summary:
      'AWS Shared Responsibility Model, Identity and Access Management (IAM), encryption, DDoS mitigation, and compliance governance.',
    keyTopics: [
      'Shared Responsibility Model across IaaS, PaaS, and SaaS',
      'IAM Users, Groups, Roles, Policies, MFA, and Root Account protection',
      'AWS Artifact, GuardDuty, Inspector, Macie, KMS, Shield, and WAF',
      'Data encryption at rest and in transit',
    ],
  },
  {
    id: 'domain-3',
    number: '03',
    title: 'Cloud Technology and Services',
    weight: 34,
    summary:
      'Core AWS compute, storage, databases, networking, global infrastructure, containers, serverless, and machine learning services.',
    keyTopics: [
      'Regions, Availability Zones (AZs), Edge Locations, Local Zones',
      'EC2, Lambda, ECS, EKS, Fargate, Elastic Beanstalk',
      'S3 Storage Classes, EBS, EFS, FSx, Storage Gateway',
      'VPC, Subnets, Security Groups vs NACLs, Route 53, CloudFront',
    ],
  },
  {
    id: 'domain-4',
    number: '04',
    title: 'Billing, Pricing, and Support',
    weight: 12,
    summary:
      'AWS pricing models, account structures, cost management tools, and AWS Support plan tiers.',
    keyTopics: [
      'EC2 On-Demand, Savings Plans, Reserved Instances, Spot Instances',
      'AWS Organizations, Consolidated Billing, Volume Discounts',
      'Cost Explorer, AWS Budgets, Cost and Usage Report, Pricing Calculator',
      'Basic, Developer, Business, and Enterprise Support Plans',
    ],
  },
];

export const WELL_ARCHITECTED_PILLARS = [
  {
    name: 'Operational Excellence',
    focus: 'Run and monitor systems to deliver business value and continually improve processes.',
    practices: 'Infrastructure as Code (CloudFormation), small reversible changes, anticipate failure.',
  },
  {
    name: 'Security',
    focus: 'Protect information, systems, and assets through risk assessments and mitigation.',
    practices: 'Principle of least privilege, MFA, encryption everywhere, automated audit trails (CloudTrail).',
  },
  {
    name: 'Reliability',
    focus: 'Ensure a workload performs its intended function correctly and consistently recovers from failure.',
    practices: 'Multi-AZ deployment, Auto Scaling, automated backups, test recovery procedures.',
  },
  {
    name: 'Performance Efficiency',
    focus: 'Use computing resources efficiently to meet system requirements as demand changes.',
    practices: 'Serverless architectures, right-sizing, CloudFront edge caching, global deployment.',
  },
  {
    name: 'Cost Optimization',
    focus: 'Run systems to deliver business value at the lowest price point.',
    practices: 'Pay-as-you-go consumption, Savings Plans, S3 Lifecycle policies, AWS Trusted Advisor.',
  },
  {
    name: 'Sustainability',
    focus: 'Minimize environmental impacts of running cloud workloads.',
    practices: 'Maximize hardware utilization, managed services, right-size instances, AWS Customer Carbon Footprint Tool.',
  },
];

export const AWS_SERVICES: AwsService[] = [
  {
    id: 'ec2',
    name: 'Amazon EC2',
    shortName: 'EC2',
    category: 'Compute',
    domain: 'domain-3',
    oneLiner: 'Resizable virtual servers in the cloud with full OS control.',
    description:
      'Amazon Elastic Compute Cloud (EC2) provides scalable virtual machines (instances) on AWS infrastructure. You choose the AMI, CPU/memory instance family, storage, and security groups.',
    keyFeatures: [
      'Instance families tuned for General Purpose (M/T), Compute (C), Memory (R), Storage (I/D), Accelerated (P/G)',
      'Auto Scaling adjusts capacity dynamically based on CloudWatch metrics',
      'Elastic Load Balancing (ALB/NLB) distributes incoming traffic across multiple AZs',
      'Supports On-Demand, Savings Plans, Reserved, Spot, and Dedicated Hosts',
    ],
    pricingModel: 'Pay per second/hour based on instance type, purchase option, and region.',
    examScenarios: [
      'You need root/OS-level access to install custom legacy software or kernel modules',
      'Interruptible batch processing or CI/CD runners -> EC2 Spot Instances (up to 90% off)',
      'Strict per-socket/per-core software licensing compliance -> EC2 Dedicated Hosts',
    ],
    compareWith: 'Lambda (serverless functions) and Lightsail (simple predictable VPS)',
  },
  {
    id: 'lambda',
    name: 'AWS Lambda',
    shortName: 'Lambda',
    category: 'Compute',
    domain: 'domain-3',
    oneLiner: 'Event-driven serverless compute that runs code without provisioning servers.',
    description:
      'AWS Lambda executes your code in response to triggers (API Gateway HTTP requests, S3 uploads, DynamoDB streams, EventBridge schedules) and scales automatically from zero to thousands of concurrent executions.',
    keyFeatures: [
      'Zero server administration, OS patching, or capacity planning',
      'Maximum execution timeout of 15 minutes per invocation',
      'Automatic high availability across multiple Availability Zones',
      'Integrates natively with over 200 AWS services and SaaS triggers',
    ],
    pricingModel: 'Pay only for number of requests and compute duration in 1ms increments; 0 cost when idle.',
    examScenarios: [
      'Process an image thumbnail immediately whenever a user uploads to an S3 bucket',
      'Run short-lived APIs or cron jobs with sporadic traffic at minimal cost',
      'Workload runs for > 15 minutes continuously -> Choose EC2, ECS, or AWS Batch instead',
    ],
    compareWith: 'EC2 (full server control, long-running) and AWS Fargate (serverless containers)',
  },
  {
    id: 'ecs-eks-fargate',
    name: 'ECS, EKS & AWS Fargate',
    shortName: 'ECS / Fargate',
    category: 'Compute',
    domain: 'domain-3',
    oneLiner: 'Managed container orchestration (Docker & Kubernetes) with optional serverless execution.',
    description:
      'Amazon ECS is AWS-native container orchestration; Amazon EKS runs managed Kubernetes control planes. AWS Fargate is the serverless compute engine that runs ECS or EKS containers without managing underlying EC2 hosts.',
    keyFeatures: [
      'ECS: Deep AWS integration, simple task definitions, no control-plane fee',
      'EKS: Upstream Kubernetes compatibility for multi-cloud or existing K8s workloads',
      'Fargate: Eliminates EC2 cluster provisioning, patching, and right-sizing for containers',
    ],
    pricingModel: 'ECS/Fargate charges per vCPU and GB memory allocated to tasks; EKS adds a per-cluster hourly fee.',
    examScenarios: [
      'Migrate an existing Kubernetes deployment from on-premises with minimal rewrites -> Amazon EKS',
      'Run Docker containers without managing or patching EC2 worker nodes -> ECS with AWS Fargate',
    ],
    compareWith: 'Lambda (function-level code) vs Fargate (packaged container images)',
  },
  {
    id: 'elastic-beanstalk',
    name: 'AWS Elastic Beanstalk',
    shortName: 'Elastic Beanstalk',
    category: 'Compute',
    domain: 'domain-3',
    oneLiner: 'PaaS service to deploy web applications automatically while retaining EC2 access.',
    description:
      'Upload your application code (Java, .NET, Python, Node.js, Go, Docker) and Elastic Beanstalk automatically handles capacity provisioning, load balancing, auto scaling, and application health monitoring.',
    keyFeatures: [
      'Automatically creates EC2, ELB, Auto Scaling groups, and RDS resources',
      'Supports blue/green and rolling deployment policies',
      'Developers retain full control over the underlying AWS resources if needed',
    ],
    pricingModel: 'No additional charge for Elastic Beanstalk itself; pay only for underlying EC2/RDS/S3 resources.',
    examScenarios: [
      'A small team wants to deploy a web app quickly without manually configuring VPCs, ALBs, and Auto Scaling',
      'Need PaaS ease-of-use while keeping the ability to SSH into the underlying EC2 instance',
    ],
    compareWith: 'CloudFormation (generic IaC for any AWS stack) and Lightsail (simple pre-packaged VPS)',
  },
  {
    id: 's3',
    name: 'Amazon S3',
    shortName: 'Amazon S3',
    category: 'Storage',
    domain: 'domain-3',
    oneLiner: 'Object storage built to store and retrieve any amount of data with 11 nines durability.',
    description:
      'Amazon Simple Storage Service (S3) stores objects inside globally uniquely named buckets within a Region. Designed for 99.999999999% (11 9s) durability across at least 3 Availability Zones.',
    keyFeatures: [
      'Storage classes: Standard, Intelligent-Tiering, Standard-IA, One Zone-IA, Glacier Instant/Flexible/Deep Archive',
      'Lifecycle rules automatically transition or expire objects to lower cost',
      'Static website hosting, Versioning, Cross-Region Replication (CRR), Object Lock (WORM)',
      'Block Public Access enabled by default; access controlled via IAM and Bucket Policies',
    ],
    pricingModel: 'Pay per GB stored (varies by class), requests (PUT/GET), and data transfer OUT to the internet.',
    examScenarios: [
      'Store regulatory archives for 7 years with rare 12-hour retrieval tolerance -> S3 Glacier Deep Archive',
      'Data with unknown or changing access patterns -> S3 Intelligent-Tiering',
      'Host a static React/HTML website with zero servers -> S3 + CloudFront',
    ],
    compareWith: 'EBS (block storage attached to EC2) and EFS (shared POSIX file system)',
  },
  {
    id: 'ebs',
    name: 'Amazon EBS',
    shortName: 'Amazon EBS',
    category: 'Storage',
    domain: 'domain-3',
    oneLiner: 'High-performance persistent block storage volumes attached to a single EC2 instance.',
    description:
      'Amazon Elastic Block Store (EBS) acts like a virtual hard drive for EC2 instances. Volumes live inside a single Availability Zone and persist independently of the instance lifecycle if configured.',
    keyFeatures: [
      'Volume types: gp3/gp2 (General Purpose SSD), io2 (Provisioned IOPS SSD), st1/sc1 (HDD)',
      'Point-in-time incremental Snapshots backed up automatically to Amazon S3',
      'Supports AES-256 encryption for volumes and snapshots via AWS KMS',
    ],
    pricingModel: 'Pay for provisioned GB per month and provisioned IOPS/throughput, plus snapshot storage.',
    examScenarios: [
      'Boot volume or low-latency transactional database disk attached to one EC2 instance',
      'Move an EBS volume to another AZ -> Take an EBS Snapshot, then create a new volume in target AZ',
    ],
    compareWith: 'EC2 Instance Store (ephemeral/temporary disk lost on stop) and EFS (shared across many EC2s)',
  },
  {
    id: 'efs',
    name: 'Amazon EFS',
    shortName: 'Amazon EFS',
    category: 'Storage',
    domain: 'domain-3',
    oneLiner: 'Serverless, elastic NFS file storage shared concurrently across multiple Linux EC2 instances.',
    description:
      'Amazon Elastic File System (EFS) provides a scalable POSIX-compliant network file system that grows and shrinks automatically as files are added or removed across multiple Availability Zones.',
    keyFeatures: [
      'Simultaneous read/write mounting from hundreds or thousands of EC2 instances or Lambda functions',
      'Multi-AZ regional redundancy by default (EFS Standard)',
      'EFS Infrequent Access (IA) lifecycle policy saves up to 92% on cold files',
    ],
    pricingModel: 'Pay only for the storage you actually use per GB-month (no pre-provisioning).',
    examScenarios: [
      'Multiple web servers in an Auto Scaling group need shared access to the same content/uploads folder',
      'Windows SMB shared file system needed -> Choose Amazon FSx for Windows File Server instead',
    ],
    compareWith: 'EBS (single EC2 attach, single AZ) and FSx (Windows SMB / Lustre HPC)',
  },
  {
    id: 'snow-family',
    name: 'AWS Snow Family',
    shortName: 'Snowball Edge',
    category: 'Storage',
    domain: 'domain-3',
    oneLiner: 'Physical ruggedized devices for offline petabyte-scale data transfer and edge computing.',
    description:
      'AWS Snowcone and Snowball Edge ship physical encrypted storage and compute appliances to remote or bandwidth-constrained environments, then ship back to AWS to ingest data directly into S3.',
    keyFeatures: [
      'Snowball Edge Storage Optimized: ~80 TB–210 TB usable capacity for large migrations',
      'Snowcone: Ultra-portable (~8–14 TB) for rugged tactical or IoT edge sites',
      'All data is KMS 256-bit encrypted with tamper-evident enclosures',
    ],
    pricingModel: 'Service fee per job plus daily usage after free shipping/processing window.',
    examScenarios: [
      'Migrate 100 TB over a slow 10 Mbps office link in under two weeks -> AWS Snowball Edge',
      'Run local compute/collection on a ship or mine with no internet -> Snowcone / Snowball Edge',
    ],
    compareWith: 'AWS DataSync (online high-speed network transfer) and Direct Connect (dedicated fiber)',
  },
  {
    id: 'rds-aurora',
    name: 'Amazon RDS & Aurora',
    shortName: 'RDS / Aurora',
    category: 'Database',
    domain: 'domain-3',
    oneLiner: 'Managed relational SQL databases with automated backups, patching, and Multi-AZ failover.',
    description:
      'Amazon Relational Database Service (RDS) automates time-consuming administration for MySQL, PostgreSQL, MariaDB, Oracle, and SQL Server. Amazon Aurora is AWS’s cloud-native MySQL/PostgreSQL-compatible engine up to 5x faster than standard MySQL.',
    keyFeatures: [
      'Multi-AZ deployments maintain a synchronous standby replica for high availability',
      'Read Replicas offload read-heavy analytics/reporting traffic asynchronously',
      'Aurora replicates 6 copies of data across 3 AZs and supports Aurora Serverless v2',
    ],
    pricingModel: 'Hourly instance fee + provisioned storage + backup/I/O.',
    examScenarios: [
      'Lift-and-shift an existing relational PostgreSQL/SQL Server database without managing OS or DB patches',
      'Improve disaster recovery and HA for RDS -> Enable Multi-AZ deployment',
      'Scale read queries globally or locally -> Add Read Replicas',
    ],
    compareWith: 'DynamoDB (NoSQL key-value) and Redshift (OLAP data warehouse)',
  },
  {
    id: 'dynamodb',
    name: 'Amazon DynamoDB',
    shortName: 'DynamoDB',
    category: 'Database',
    domain: 'domain-3',
    oneLiner: 'Serverless NoSQL key-value and document database delivering single-digit millisecond latency.',
    description:
      'Amazon DynamoDB is a fully managed, multi-Region, multi-active non-relational database engineered to scale seamlessly to millions of requests per second with virtually unlimited throughput.',
    keyFeatures: [
      'Predictable single-digit millisecond latency at any scale',
      'DynamoDB Accelerator (DAX) provides an in-memory cache for microsecond reads',
      'Global Tables replicate data across multiple AWS Regions for active-active apps',
      'Serverless billing via On-Demand capacity or Provisioned RCU/WCU',
    ],
    pricingModel: 'Pay per read/write request unit (On-Demand) or provisioned capacity + GB stored.',
    examScenarios: [
      'Gaming leaderboards, shopping carts, or IoT session state requiring rapid schema-less lookups',
      'Strict SQL JOINs and complex multi-table ACID transactions -> Choose RDS or Aurora instead',
    ],
    compareWith: 'RDS (relational SQL) and ElastiCache (Redis/Memcached in-memory cache)',
  },
  {
    id: 'redshift',
    name: 'Amazon Redshift',
    shortName: 'Redshift',
    category: 'Database',
    domain: 'domain-3',
    oneLiner: 'Petabyte-scale columnar cloud data warehouse for Business Intelligence and OLAP analytics.',
    description:
      'Amazon Redshift uses massively parallel processing (MPP) and columnar storage to execute complex analytical SQL queries across terabytes or petabytes of structured data.',
    keyFeatures: [
      'Redshift Serverless automatically provisions and scales warehouse capacity',
      'Redshift Spectrum queries exabytes of data directly inside Amazon S3 without loading',
      'Integrates with Amazon QuickSight for BI dashboards',
    ],
    pricingModel: 'Per-node hourly (or RPU-hours for Serverless) with Reserved Instance discounts.',
    examScenarios: [
      'Analyze 5 years of historical sales data across billions of rows for executive BI reports (OLAP)',
      'Day-to-day live order transactions (OLTP) -> Choose RDS/Aurora or DynamoDB instead',
    ],
    compareWith: 'RDS (OLTP live transactions) and Athena (serverless ad-hoc SQL directly on S3)',
  },
  {
    id: 'elasticache',
    name: 'Amazon ElastiCache',
    shortName: 'ElastiCache',
    category: 'Database',
    domain: 'domain-3',
    oneLiner: 'Managed in-memory caching service supporting Redis and Memcached for sub-millisecond reads.',
    description:
      'Amazon ElastiCache accelerates read-heavy applications and relieves database load by storing frequently accessed data in RAM instead of disk.',
    keyFeatures: [
      'Supports Valkey, Redis OSS, and Memcached engines',
      'Sub-millisecond response times for session stores and real-time leaderboards',
    ],
    pricingModel: 'Pay per cache node hour or serverless memory/ECPU usage.',
    examScenarios: [
      'Database CPU is spiking from repeated identical catalog lookups -> Place ElastiCache in front of RDS',
    ],
    compareWith: 'DynamoDB DAX (cache specifically for DynamoDB) and CloudFront (CDN edge caching)',
  },
  {
    id: 'vpc',
    name: 'Amazon VPC',
    shortName: 'Amazon VPC',
    category: 'Networking',
    domain: 'domain-3',
    oneLiner: 'Logically isolated virtual network where you define IP ranges, subnets, routing, and firewalls.',
    description:
      'Amazon Virtual Private Cloud (VPC) gives you full control over your virtual networking environment, including CIDR blocks, public vs. private subnets, Internet Gateways, and NAT Gateways.',
    keyFeatures: [
      'Security Groups: Stateful instance-level firewall (allow rules only; return traffic auto-allowed)',
      'Network ACLs (NACLs): Stateless subnet-level firewall (explicit Allow AND Deny rules, evaluated in order)',
      'Internet Gateway (IGW) connects public subnets to internet; NAT Gateway lets private instances reach internet outbound',
      'VPC Peering and Transit Gateway interconnect multiple VPCs privately',
    ],
    pricingModel: 'VPC itself is free; charges apply for NAT Gateways, VPNs, Elastic IPs (if idle/in-use), and data transfer.',
    examScenarios: [
      'Block a specific malicious IP address at the subnet boundary -> Network ACL (explicit Deny)',
      'Allow private database instances to download OS patches without accepting inbound internet traffic -> NAT Gateway',
      'Connect S3/DynamoDB privately without traversing the public internet -> VPC Gateway Endpoint',
    ],
    compareWith: 'AWS Direct Connect (dedicated physical fiber from on-prem to AWS)',
  },
  {
    id: 'cloudfront',
    name: 'Amazon CloudFront',
    shortName: 'CloudFront',
    category: 'Networking',
    domain: 'domain-3',
    oneLiner: 'Global Content Delivery Network (CDN) caching static and dynamic content at Edge Locations.',
    description:
      'Amazon CloudFront accelerates delivery of websites, APIs, and video streaming by caching copies closer to global end users across hundreds of AWS Edge Locations.',
    keyFeatures: [
      'Caches assets in Edge Locations to slash latency and reduce origin load',
      'Includes AWS Shield Standard DDoS protection and integrates seamlessly with AWS WAF',
      'Supports HTTPS termination with free ACM TLS/SSL certificates',
    ],
    pricingModel: 'Pay for data transfer out from edge locations and HTTP/HTTPS requests.',
    examScenarios: [
      'Global users experience slow load times downloading images/videos from a single S3 region -> CloudFront',
      'Protect a public web app at the edge with geo-restriction and WAF rules -> CloudFront + WAF',
    ],
    compareWith: 'AWS Global Accelerator (improves TCP/UDP routing via Anycast IPs, no content caching)',
  },
  {
    id: 'route53',
    name: 'Amazon Route 53',
    shortName: 'Route 53',
    category: 'Networking',
    domain: 'domain-3',
    oneLiner: 'Highly available, scalable Domain Name System (DNS) web service with 100% availability SLA.',
    description:
      'Amazon Route 53 translates human-readable domain names (example.com) into IP addresses, registers domains, performs automated health checks, and routes global traffic intelligently.',
    keyFeatures: [
      'Routing policies: Simple, Weighted, Latency-based, Failover, Geolocation, Geoproximity',
      'Health checks automatically route users away from unhealthy endpoints',
      'Alias records point root domains directly to ALBs, CloudFront, or S3 static sites for free',
    ],
    pricingModel: 'Monthly fee per Hosted Zone + per million DNS queries + health checks.',
    examScenarios: [
      'Direct users to whichever AWS Region provides the lowest network delay -> Latency-based routing',
      'Gradually shift 10% of traffic to a new release -> Weighted routing',
      'Automatic active-passive disaster recovery DNS switch -> Failover routing',
    ],
    compareWith: 'CloudFront (caches content) vs Route 53 (resolves DNS names)',
  },
  {
    id: 'direct-connect',
    name: 'AWS Direct Connect',
    shortName: 'Direct Connect',
    category: 'Networking',
    domain: 'domain-3',
    oneLiner: 'Dedicated private fiber-optic network connection from your on-premises data center to AWS.',
    description:
      'AWS Direct Connect bypasses the public internet by establishing a dedicated physical link between your corporate facility and an AWS Direct Connect location, yielding consistent bandwidth and lower latency.',
    keyFeatures: [
      'Dedicated 1 Gbps, 10 Gbps, or 100 Gbps private link (does not traverse public internet)',
      'Reduces outbound bandwidth costs compared to internet data transfer',
      'Note: Takes weeks/months to provision physically; pair with Site-to-Site VPN for encryption or immediate backup',
    ],
    pricingModel: 'Hourly port charge + outbound data transfer at reduced Direct Connect rates.',
    examScenarios: [
      'Hybrid workload needs predictable high-throughput private link to AWS without public internet jitter',
      'Need an encrypted tunnel set up in under an hour over the internet -> AWS Site-to-Site VPN instead',
    ],
    compareWith: 'AWS Site-to-Site VPN (fast IPsec tunnel over public internet)',
  },
  {
    id: 'iam',
    name: 'AWS IAM',
    shortName: 'AWS IAM',
    category: 'Security & IAM',
    domain: 'domain-2',
    oneLiner: 'Centralized service to securely manage authentication and fine-grained authorization.',
    description:
      'AWS Identity and Access Management (IAM) controls who (authentication) can do what (authorization) on which AWS resources using Users, Groups, Roles, and JSON Policies.',
    keyFeatures: [
      'Principle of Least Privilege: grant only the permissions required to perform a task',
      'IAM Roles provide temporary credentials (via STS) for EC2 instances, Lambda, and federated users',
      'Lock away the Root User: enable MFA, delete root access keys, use IAM Admin users for daily tasks',
      'IAM Access Analyzer identifies resources shared with external entities',
    ],
    pricingModel: 'Included at no additional charge with your AWS account.',
    examScenarios: [
      'An EC2 instance needs permission to read from an S3 bucket -> Attach an IAM Role (never embed access keys!)',
      'Apply permissions consistently to 50 developers -> Assign policy to an IAM Group, add Users to Group',
    ],
    compareWith: 'Amazon Cognito (authentication for millions of external web/mobile end-users)',
  },
  {
    id: 'kms',
    name: 'AWS KMS',
    shortName: 'AWS KMS',
    category: 'Security & IAM',
    domain: 'domain-2',
    oneLiner: 'Managed encryption key service to create, rotate, and audit cryptographic keys.',
    description:
      'AWS Key Management Service (KMS) integrates seamlessly across AWS services (S3, EBS, RDS, Secrets Manager) to encrypt data at rest using FIPS 140-2/3 validated hardware security modules.',
    keyFeatures: [
      'Supports AWS managed keys and Customer Managed Keys (CMKs) with automatic annual rotation',
      'Every key usage is logged automatically to AWS CloudTrail for audit compliance',
    ],
    pricingModel: 'Monthly fee per Customer Managed Key + per 10,000 API requests.',
    examScenarios: [
      'Encrypt EBS volumes and S3 objects while maintaining audit logs and automatic key rotation -> KMS',
      'Need dedicated single-tenant HSM hardware where AWS cannot access keys -> AWS CloudHSM instead',
    ],
    compareWith: 'AWS Secrets Manager (rotates DB passwords/API keys) and CloudHSM (single-tenant hardware)',
  },
  {
    id: 'shield-waf',
    name: 'AWS Shield & AWS WAF',
    shortName: 'Shield / WAF',
    category: 'Security & IAM',
    domain: 'domain-2',
    oneLiner: 'DDoS mitigation (Shield) and Layer 7 web application firewall against SQLi/XSS (WAF).',
    description:
      'AWS Shield protects infrastructure from Distributed Denial of Service (DDoS) attacks at Layers 3/4. AWS WAF filters malicious Layer 7 HTTP/HTTPS web traffic such as SQL injection and cross-site scripting.',
    keyFeatures: [
      'Shield Standard: Automatically enabled at zero cost for all AWS customers (protects CloudFront/Route 53)',
      'Shield Advanced: Paid tier with 24/7 DDoS Response Team (SRT) and DDoS cost protection',
      'AWS WAF attaches to CloudFront, ALB, and API Gateway with custom or managed IP/rate rules',
    ],
    pricingModel: 'Shield Standard is free; Shield Advanced is $3,000/month; WAF charges per Web ACL, rule, and million requests.',
    examScenarios: [
      'Block SQL injection, XSS, or bots hitting a login URL -> AWS WAF',
      'Defend against volumetric SYN floods or UDP reflection DDoS attacks -> AWS Shield',
    ],
    compareWith: 'Security Groups (VPC instance firewall) vs WAF (HTTP Layer 7 inspection)',
  },
  {
    id: 'guardduty-inspector-macie',
    name: 'GuardDuty, Inspector & Macie',
    shortName: 'Security Analytics',
    category: 'Security & IAM',
    domain: 'domain-2',
    oneLiner: 'Automated threat detection (GuardDuty), vulnerability scanning (Inspector), and PII discovery (Macie).',
    description:
      'AWS provides purpose-built managed security services: GuardDuty analyzes logs using ML for malicious behavior; Inspector scans EC2/ECR/Lambda for CVEs; Macie discovers sensitive data like SSNs or credit cards in S3.',
    keyFeatures: [
      'GuardDuty: Continuously monitors CloudTrail, VPC Flow Logs, and DNS logs without agents',
      'Inspector: Automated software vulnerability and unintended network exposure scanning',
      'Macie: Machine learning classification for PII/PHI inside Amazon S3 buckets',
      'Security Hub: Central dashboard aggregating findings from GuardDuty, Inspector, Macie, and partners',
    ],
    pricingModel: 'Pay-per-use based on log volume analyzed (GuardDuty), scanned instances/images (Inspector), or GB evaluated (Macie).',
    examScenarios: [
      'Detect anomalous API calls or crypto-mining activity in real time -> Amazon GuardDuty',
      'Find unpatched software CVEs on EC2 instances or container images -> Amazon Inspector',
      'Audit S3 buckets for accidentally exposed Social Security Numbers -> Amazon Macie',
    ],
    compareWith: 'Amazon Detective (root-cause investigation) and AWS Artifact (compliance PDF reports)',
  },
  {
    id: 'artifact',
    name: 'AWS Artifact',
    shortName: 'AWS Artifact',
    category: 'Security & IAM',
    domain: 'domain-2',
    oneLiner: 'Self-service portal for on-demand AWS compliance reports (SOC 2, ISO 27001, PCI DSS) and agreements.',
    description:
      'AWS Artifact provides instant download access to AWS third-party security and compliance audit reports as well as Business Associate Addenda (BAA) for HIPAA compliance.',
    keyFeatures: [
      'Artifact Reports: SOC 1/2/3, PCI DSS, ISO 27001, FedRAMP compliance certifications',
      'Artifact Agreements: Accept HIPAA BAA or GDPR DPA online',
    ],
    pricingModel: 'Available at no additional charge in the AWS Management Console.',
    examScenarios: [
      'An external auditor asks for proof of AWS physical data center SOC 2 or ISO 27001 compliance -> AWS Artifact',
    ],
    compareWith: 'AWS Audit Manager (continuously collects evidence for your own AWS usage)',
  },
  {
    id: 'cloudtrail-config-cloudwatch',
    name: 'CloudTrail, Config & CloudWatch',
    shortName: 'Observability Trio',
    category: 'Management & Governance',
    domain: 'domain-3',
    oneLiner: 'API auditing (CloudTrail), resource configuration tracking (Config), and metrics/logs (CloudWatch).',
    description:
      'These three governance pillars answer distinct questions: CloudTrail tracks WHO made an API call, AWS Config tracks HOW resource configurations change over time, and CloudWatch monitors performance metrics and alarms.',
    keyFeatures: [
      'CloudTrail: Records every console click, CLI command, and SDK API call (enabled by default for 90 days)',
      'AWS Config: Evaluates resource compliance against rules (e.g., "Are all EBS volumes encrypted?")',
      'CloudWatch: Collects CPU/network metrics, application logs, and triggers Auto Scaling alarms',
    ],
    pricingModel: 'CloudTrail first trail management events free; Config charges per configuration item/rule; CloudWatch pays per metric/GB.',
    examScenarios: [
      'Investigate who deleted an S3 bucket yesterday at 3 PM -> AWS CloudTrail',
      'Alert and auto-remediate if someone opens port 22 to 0.0.0.0/0 -> AWS Config',
      'Trigger Auto Scaling when average EC2 CPU exceeds 75% -> Amazon CloudWatch',
    ],
    compareWith: 'Trusted Advisor (best-practice recommendations) vs Config (historical compliance rules)',
  },
  {
    id: 'cloudformation',
    name: 'AWS CloudFormation',
    shortName: 'CloudFormation',
    category: 'Management & Governance',
    domain: 'domain-3',
    oneLiner: 'Infrastructure as Code (IaC) service to model and provision AWS stacks via JSON/YAML.',
    description:
      'AWS CloudFormation lets you define your entire cloud environment—VPCs, EC2s, RDS, IAM roles—in declarative templates so environments can be version-controlled and deployed identically across Regions.',
    keyFeatures: [
      'Repeatable, automated stack creation, updates, and clean tear-down (rollback on failure)',
      'Drift detection identifies manual console changes that diverge from the template',
      'AWS CDK allows defining CloudFormation templates using TypeScript, Python, or Java',
    ],
    pricingModel: 'No charge for CloudFormation itself; pay only for the provisioned AWS resources.',
    examScenarios: [
      'Replicate an identical production VPC and application stack across three AWS Regions reliably -> CloudFormation',
    ],
    compareWith: 'Elastic Beanstalk (app PaaS) vs CloudFormation (any AWS infrastructure via code)',
  },
  {
    id: 'trusted-advisor',
    name: 'AWS Trusted Advisor',
    shortName: 'Trusted Advisor',
    category: 'Management & Governance',
    domain: 'domain-4',
    oneLiner: 'Automated best-practice advisor inspecting Cost, Performance, Security, Fault Tolerance, and Service Quotas.',
    description:
      'AWS Trusted Advisor inspects your live AWS environment and provides actionable recommendations across five categories—flagging idle load balancers, unassociated Elastic IPs, public S3 buckets, and missing MFA on root.',
    keyFeatures: [
      'Core security checks and Service Quotas checks are free on Basic/Developer plans',
      'Full check suite across all 5 categories requires Business or Enterprise Support',
    ],
    pricingModel: 'Core checks free; full checks included with Business/Enterprise Support.',
    examScenarios: [
      'Identify underutilized EC2 instances, open security group ports, or missing Root MFA -> Trusted Advisor',
    ],
    compareWith: 'AWS Inspector (OS/container CVE scanning) vs Trusted Advisor (account-wide best practices)',
  },
  {
    id: 'organizations',
    name: 'AWS Organizations',
    shortName: 'Organizations',
    category: 'Billing & Support',
    domain: 'domain-4',
    oneLiner: 'Central governance and consolidated billing across multiple AWS accounts.',
    description:
      'AWS Organizations groups multiple AWS accounts into Organizational Units (OUs), enables a single consolidated bill across all accounts, pools volume discounts, and enforces guardrails via Service Control Policies (SCPs).',
    keyFeatures: [
      'Consolidated Billing aggregates usage across accounts for higher volume tier discounts',
      'Service Control Policies (SCPs) restrict maximum permissions across entire OUs (even for account admins)',
      'Reserved Instance and Savings Plan discounts can be shared across member accounts',
    ],
    pricingModel: 'Free service.',
    examScenarios: [
      'Combine data transfer usage across 15 subsidiary accounts to unlock cheaper tier pricing -> AWS Organizations',
      'Prevent developers in Sandbox accounts from ever launching expensive GPU instances -> Service Control Policy (SCP)',
    ],
    compareWith: 'IAM Policies (within one account) vs SCPs (account-wide guardrails across an Organization)',
  },
  {
    id: 'budgets-cost-explorer',
    name: 'Cost Explorer, Budgets & Calculator',
    shortName: 'Cost Tools',
    category: 'Billing & Support',
    domain: 'domain-4',
    oneLiner: 'Suite for forecasting spend (Cost Explorer), alerting thresholds (Budgets), and pre-migration estimates (Calculator).',
    description:
      'AWS provides specialized financial tools depending on whether you are planning ahead, analyzing past trends, or setting automated spending alerts.',
    keyFeatures: [
      'AWS Pricing Calculator: Estimate monthly costs BEFORE migrating or deploying workloads',
      'AWS Cost Explorer: Visualize historical spend (up to 12 months) and forecast next 12 months',
      'AWS Budgets: Send email/SNS alerts or trigger actions when actual or forecasted spend exceeds a threshold',
      'AWS Cost and Usage Report (CUR): Most granular line-by-line billing CSV/Parquet dataset stored in S3',
    ],
    pricingModel: 'Cost Explorer UI, Pricing Calculator, and first 2 Budgets are free.',
    examScenarios: [
      'Receive an email if monthly spend is forecasted to exceed $500 -> AWS Budgets',
      'Model the cost of a proposed new workload before creating an AWS account -> AWS Pricing Calculator',
      'Analyze which service drove a cost spike last quarter -> AWS Cost Explorer',
    ],
    compareWith: 'AWS Cost Anomaly Detection (ML-based alert for unusual unexpected spend spikes)',
  },
  {
    id: 'ai-ml-services',
    name: 'Managed AI & ML Services',
    shortName: 'Rekognition / SageMaker',
    category: 'Analytics & AI',
    domain: 'domain-3',
    oneLiner: 'Purpose-built AI APIs (Rekognition, Comprehend, Polly, Transcribe, Translate) plus SageMaker for custom ML.',
    description:
      'AWS offers pre-trained plug-and-play AI APIs alongside Amazon SageMaker (end-to-end platform to build, train, and deploy custom ML models) and Amazon Bedrock (foundation models for generative AI).',
    keyFeatures: [
      'Rekognition: Image and video object/face/moderation analysis',
      'Comprehend: NLP sentiment analysis, entity extraction, and language detection',
      'Transcribe (Speech-to-Text), Polly (Text-to-Speech), Translate (real-time translation), Lex (chatbots)',
      'Textract: Extracts text, handwriting, and tables from scanned PDFs/forms',
    ],
    pricingModel: 'Pay-per-API-call / per-minute / per-page for AI APIs; instance-hours for SageMaker.',
    examScenarios: [
      'Extract form fields and tables from scanned medical PDFs -> Amazon Textract',
      'Convert customer call recordings into searchable text + sentiment -> Transcribe + Comprehend',
      'Build and train a proprietary custom ML fraud model -> Amazon SageMaker',
    ],
    compareWith: 'Bedrock (managed generative AI foundation models) vs SageMaker (custom ML lifecycle)',
  },
];

export const SHARED_RESPONSIBILITY_TASKS: SharedResponsibilityTask[] = [
  {
    id: 'sr-1',
    task: 'Physical security of data centers, power, and cooling',
    context: 'All AWS Services',
    owner: 'AWS',
    explanation:
      'AWS is always responsible for security OF the cloud: physical facilities, environmental controls, and hardware lifecycle.',
  },
  {
    id: 'sr-2',
    task: 'Patching the Guest Operating System (Linux/Windows) on Amazon EC2',
    context: 'Infrastructure as a Service (EC2)',
    owner: 'Customer',
    explanation:
      'Because EC2 gives you full OS control, patching the guest OS, installing antivirus, and configuring OS firewalls are Customer responsibilities.',
  },
  {
    id: 'sr-3',
    task: 'Patching the underlying database engine & OS for Amazon RDS',
    context: 'Managed Service (Amazon RDS)',
    owner: 'AWS',
    explanation:
      'With managed services like RDS, AWS manages the OS and database engine patching; the customer still manages schema, firewall rules, and IAM/DB access.',
  },
  {
    id: 'sr-4',
    task: 'Configuring IAM users, least-privilege policies, and enabling MFA',
    context: 'Account Security',
    owner: 'Customer',
    explanation:
      'AWS provides the IAM service, but the Customer owns identity governance, password policies, MFA enforcement, and access permissions.',
  },
  {
    id: 'sr-5',
    task: 'Enabling encryption and Block Public Access on an Amazon S3 bucket',
    context: 'Data Protection',
    owner: 'Customer',
    explanation:
      'Security IN the cloud means the customer chooses how data is classified, encrypted, and exposed via bucket policies.',
  },
  {
    id: 'sr-6',
    task: 'Patching and maintaining the hypervisor and physical host firmware',
    context: 'Virtualization Layer',
    owner: 'AWS',
    explanation:
      'AWS isolates compute hardware and maintains the Nitro/Xen virtualization hypervisor layer across all regions.',
  },
  {
    id: 'sr-7',
    task: 'Patch Management, Configuration Management, and Awareness & Training',
    context: 'Cross-cutting Controls',
    owner: 'Shared',
    explanation:
      'Shared Controls apply to both AWS and Customer in separate layers: AWS patches infrastructure hosts and trains AWS staff; the Customer patches guest OS/apps and trains its own employees.',
  },
  {
    id: 'sr-8',
    task: 'Updating runtime dependencies inside an AWS Lambda function package',
    context: 'Serverless (AWS Lambda)',
    owner: 'Customer',
    explanation:
      'AWS secures and patches the underlying Lambda OS/execution environment, while the Customer is responsible for application code, third-party libraries, and IAM execution roles.',
  },
  {
    id: 'sr-9',
    task: 'Configuring VPC Security Groups and Network ACL rules',
    context: 'Network Protection',
    owner: 'Customer',
    explanation:
      'AWS protects the global backbone network against external threats; the Customer configures inbound/outbound ports in Security Groups and NACLs.',
  },
  {
    id: 'sr-10',
    task: 'Secure decommissioning and wiping of retired storage drives',
    context: 'Hardware Disposal',
    owner: 'AWS',
    explanation:
      'AWS follows NIST 800-88 standards to decommission and physically destroy retired storage media before it leaves data centers.',
  },
];

export const SUPPORT_PLANS: SupportPlan[] = [
  {
    name: 'Basic',
    monthlyCost: '$0 / month',
    technicalSupport: 'None (Billing & account support only; forums & docs)',
    sevResponse: 'N/A',
    trustedAdvisor: '7 core security & service quota checks',
    bestFor: 'Learning, personal experiments, and non-critical sandboxes',
  },
  {
    name: 'Developer',
    monthlyCost: 'Greater of $29/mo or 3% of spend',
    technicalSupport: 'Business hours email access (1 primary contact)',
    sevResponse: '< 12 hrs (System impaired) · < 24 hrs (General guidance)',
    trustedAdvisor: '7 core security & service quota checks',
    bestFor: 'Early testing and development environments',
  },
  {
    name: 'Business',
    monthlyCost: 'Greater of $100/mo or tiered % (starting 10%)',
    technicalSupport: '24/7 phone, chat, and email (unlimited contacts)',
    sevResponse: '< 1 hr (Production system down) · < 4 hrs (Impaired)',
    trustedAdvisor: 'Full check suite + AWS Support API',
    bestFor: 'Production workloads requiring 24/7 rapid response & Trusted Advisor',
  },
  {
    name: 'Enterprise',
    monthlyCost: 'Greater of $15,000/mo or tiered % (starting 10%)',
    technicalSupport: '24/7 access + Designated Technical Account Manager (TAM)',
    sevResponse: '< 15 min (Business-critical system down)',
    trustedAdvisor: 'Full check suite + Proactive Well-Architected & Event Management',
    bestFor: 'Mission-critical enterprise workloads needing a TAM and 15-min SLA',
  },
];
