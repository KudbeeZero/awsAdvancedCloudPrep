import { QuizQuestion } from './types';

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  // DOMAIN 1: CLOUD CONCEPTS (24%)
  {
    id: 'q-d1-1',
    domain: 'domain-1',
    question:
      'Which AWS Cloud advantage describes replacing upfront data center hardware purchases with paying only as compute resources are consumed?',
    options: [
      'Benefit from massive economies of scale',
      'Trade fixed expense for variable expense',
      'Stop guessing capacity',
      'Go global in minutes',
    ],
    correctIndices: [1],
    explanation:
      'Trading fixed (capital/CapEx) expense for variable (operational/OpEx) expense means paying only for what you consume instead of investing heavily in physical servers upfront.',
    distractorNotes: [
      'Economies of scale refers to AWS lowering unit prices by aggregating usage from hundreds of thousands of customers.',
      'Stop guessing capacity describes elastic scaling to avoid over- or under-provisioning.',
      'Go global in minutes refers to deploying in Regions worldwide with minimal setup.',
    ],
  },
  {
    id: 'q-d1-2',
    domain: 'domain-1',
    question:
      'A company migrates a legacy application to AWS by moving its virtual machines as-is without modifying application code or architecture. Which migration strategy is this?',
    options: ['Refactor', 'Replatform', 'Rehost', 'Repurchase'],
    correctIndices: [2],
    explanation:
      'Rehost ("lift-and-shift") moves workloads to AWS without code or architectural changes, ideal for rapid migrations.',
    distractorNotes: [
      'Refactor (re-architect) rewrites the application using cloud-native patterns like serverless.',
      'Replatform ("lift-tinker-and-shift") makes minor cloud optimizations (e.g., moving a DB to RDS) without changing core code.',
      'Repurchase ("drop and shop") replaces an app with a SaaS subscription.',
    ],
  },
  {
    id: 'q-d1-3',
    domain: 'domain-1',
    question:
      'Which pillar of the AWS Well-Architected Framework focuses on running systems to deliver business value at the lowest possible price point?',
    options: [
      'Operational Excellence',
      'Reliability',
      'Cost Optimization',
      'Performance Efficiency',
    ],
    correctIndices: [2],
    explanation:
      'Cost Optimization ensures workloads achieve business outcomes at the lowest price through right-sizing, Savings Plans, and consumption-based models.',
    distractorNotes: [
      'Operational Excellence focuses on running/monitoring systems and continually improving processes.',
      'Reliability ensures workloads recover from failures and meet demand consistently.',
      'Performance Efficiency focuses on using compute resources efficiently as technology evolves.',
    ],
  },
  {
    id: 'q-d1-4',
    domain: 'domain-1',
    multiSelect: true,
    question:
      'Which TWO perspectives belong to the AWS Cloud Adoption Framework (AWS CAF)? (Choose TWO)',
    options: [
      'Security',
      'Elasticity',
      'Operations',
      'Serverless',
      'Durability',
    ],
    correctIndices: [0, 2],
    explanation:
      'AWS CAF organizes organizational readiness into six perspectives: Business, People, Governance, Platform, Security, and Operations.',
    distractorNotes: [
      'Elasticity, Serverless, and Durability are technical cloud properties, not AWS CAF perspectives.',
    ],
  },
  {
    id: 'q-d1-5',
    domain: 'domain-1',
    question:
      'A company adopts an AWS Marketplace SaaS CRM platform to replace its aging on-premises customer database. Which of the 7 Rs of migration does this represent?',
    options: ['Retain', 'Retire', 'Repurchase', 'Relocate'],
    correctIndices: [2],
    explanation:
      'Repurchase ("drop and shop") moves to a different product, typically replacing a self-hosted tool with a SaaS license.',
    distractorNotes: [
      'Retain keeps workloads on-premises for now.',
      'Retire decommissions applications that are no longer needed.',
      'Relocate moves VMware Cloud on AWS VMs without rewriting or buying new hardware.',
    ],
  },
  {
    id: 'q-d1-6',
    domain: 'domain-1',
    question:
      'Which AWS Well-Architected Framework design principle recommends deploying infrastructure via code and making frequent, small, reversible changes?',
    options: [
      'Operational Excellence',
      'Security',
      'Sustainability',
      'Reliability',
    ],
    correctIndices: [0],
    explanation:
      'Operational Excellence emphasizes performing operations as code, making frequent, small, reversible changes, and refining procedures regularly.',
    distractorNotes: [
      'Security centers on least privilege, traceability, and protecting data.',
      'Sustainability focuses on reducing energy and hardware footprint.',
      'Reliability focuses on automatic recovery and scaling horizontally.',
    ],
  },
  {
    id: 'q-d1-7',
    domain: 'domain-1',
    question:
      'Which AWS tool helps organizations calculate the environmental carbon footprint of their AWS workloads over time?',
    options: [
      'AWS Cost Explorer',
      'AWS Customer Carbon Footprint Tool',
      'AWS Trusted Advisor',
      'AWS Compute Optimizer',
    ],
    correctIndices: [1],
    explanation:
      'The AWS Customer Carbon Footprint Tool (inside the Billing console) measures estimated carbon emissions from AWS usage to support the Sustainability pillar.',
    distractorNotes: [
      'Cost Explorer analyzes financial spend rather than carbon emissions.',
      'Trusted Advisor inspects best practices across 5 operational categories.',
      'Compute Optimizer recommends right-sized EC2/EBS/Lambda specs.',
    ],
  },
  {
    id: 'q-d1-8',
    domain: 'domain-1',
    question:
      'An organization moves its monolithic on-premises ERP to AWS microservices using AWS Lambda and Amazon DynamoDB to gain agility. Which migration strategy is this?',
    options: ['Rehost', 'Replatform', 'Refactor', 'Retain'],
    correctIndices: [2],
    explanation:
      'Refactor (re-architect) reimagines how an application is built and delivered using cloud-native architectures like microservices and serverless.',
    distractorNotes: [
      'Rehost moves servers as-is.',
      'Replatform makes minor managed-service swaps without re-architecting.',
      'Retain leaves the app in its current environment.',
    ],
  },
  {
    id: 'q-d1-9',
    domain: 'domain-1',
    question:
      'Why does AWS periodically lower service prices even without competitive pressure?',
    options: [
      'Mandatory government price caps',
      'Massive economies of scale',
      'Elimination of Availability Zones',
      'Mandatory 3-year customer contracts',
    ],
    correctIndices: [1],
    explanation:
      'Aggregated demand across millions of customers creates massive economies of scale, allowing AWS to achieve lower hardware/power unit costs and pass savings back.',
    distractorNotes: [
      'AWS passes infrastructure efficiency gains to users; it does not eliminate AZs or force 3-year contracts.',
    ],
  },
  {
    id: 'q-d1-10',
    domain: 'domain-1',
    question:
      'Which Well-Architected Framework pillar focuses on minimizing energy consumption and maximizing hardware utilization?',
    options: [
      'Performance Efficiency',
      'Sustainability',
      'Cost Optimization',
      'Operational Excellence',
    ],
    correctIndices: [1],
    explanation:
      'The Sustainability pillar (the 6th pillar) focuses on reducing the environmental impact of cloud workloads through efficient hardware use and managed services.',
    distractorNotes: [
      'Cost Optimization targets financial spend, though sustainability improvements often reduce cost as a side benefit.',
    ],
  },

  // DOMAIN 2: SECURITY AND COMPLIANCE (30%)
  {
    id: 'q-d2-1',
    domain: 'domain-2',
    question:
      'Under the AWS Shared Responsibility Model, which task is ALWAYS the responsibility of AWS?',
    options: [
      'Patching the guest OS on Amazon EC2 instances',
      'Managing IAM user passwords and MFA devices',
      'Physical security of data center facilities and hardware disposal',
      'Configuring S3 bucket permissions and encryption settings',
    ],
    correctIndices: [2],
    explanation:
      'AWS is responsible for security OF the cloud, including physical data centers, power, cooling, networking hardware, and drive decommissioning.',
    distractorNotes: [
      'Guest OS patching on EC2, IAM configuration, and S3 data permissions are all Customer responsibilities ("security IN the cloud").',
    ],
  },
  {
    id: 'q-d2-2',
    domain: 'domain-2',
    question:
      'Which AWS service provides on-demand access to AWS SOC 2, PCI DSS, and ISO 27001 compliance reports for auditors?',
    options: ['AWS Shield', 'AWS Artifact', 'AWS Inspector', 'AWS Audit Manager'],
    correctIndices: [1],
    explanation:
      'AWS Artifact is the self-service portal for downloading third-party AWS compliance reports and accepting compliance agreements like the HIPAA BAA.',
    distractorNotes: [
      'AWS Shield is for DDoS protection.',
      'Amazon Inspector scans workloads for software CVEs.',
      'AWS Audit Manager continuously maps your own account usage to compliance frameworks.',
    ],
  },
  {
    id: 'q-d2-3',
    domain: 'domain-2',
    question:
      'An application hosted on Amazon EC2 needs write access to an Amazon S3 bucket. What is the MOST secure way to grant these permissions?',
    options: [
      'Store the AWS root user credentials on the EC2 instance',
      'Create an IAM user access key and embed it inside the application source code',
      'Attach an IAM Role with least-privilege S3 write permissions to the EC2 instance',
      'Make the S3 bucket publicly writable',
    ],
    correctIndices: [2],
    explanation:
      'IAM Roles provide temporary, automatically rotated credentials to EC2 instances via AWS STS, eliminating hardcoded secrets.',
    distractorNotes: [
      'Root credentials and embedded static keys create severe credential-leak risks; public write access exposes the bucket to everyone.',
    ],
  },
  {
    id: 'q-d2-4',
    domain: 'domain-2',
    question:
      'Which service uses machine learning to automatically discover and classify sensitive data such as credit card numbers or SSNs inside Amazon S3 buckets?',
    options: [
      'Amazon GuardDuty',
      'Amazon Macie',
      'Amazon Inspector',
      'AWS Secrets Manager',
    ],
    correctIndices: [1],
    explanation:
      'Amazon Macie inspects Amazon S3 buckets using machine learning and pattern matching to detect PII/PHI and alert on unencrypted or public sensitive buckets.',
    distractorNotes: [
      'GuardDuty detects account/network threats in CloudTrail/VPC Flow/DNS logs.',
      'Inspector scans EC2/Lambda/ECR for software vulnerabilities (CVEs).',
      'Secrets Manager stores and rotates database credentials/API keys.',
    ],
  },
  {
    id: 'q-d2-5',
    domain: 'domain-2',
    question:
      'A web application behind an Application Load Balancer is experiencing SQL injection and cross-site scripting (XSS) attacks. Which AWS service should be deployed?',
    options: ['AWS WAF', 'AWS Shield Standard', 'Amazon VPC Flow Logs', 'AWS KMS'],
    correctIndices: [0],
    explanation:
      'AWS WAF is a Layer 7 Web Application Firewall that inspects HTTP/HTTPS requests to block SQL injection, XSS, and malicious bot traffic.',
    distractorNotes: [
      'AWS Shield protects against Layer 3/4 volumetric DDoS floods, not Layer 7 SQL injection payloads.',
      'VPC Flow Logs only capture IP traffic metadata; KMS manages encryption keys.',
    ],
  },
  {
    id: 'q-d2-6',
    domain: 'domain-2',
    multiSelect: true,
    question:
      'Which TWO best practices should be applied immediately after creating a new AWS account? (Choose TWO)',
    options: [
      'Enable Multi-Factor Authentication (MFA) on the AWS account root user',
      'Share the root user password with senior DevOps engineers',
      'Create an IAM user/role with administrative permissions for daily use and lock away root',
      'Generate two active root access keys for automation scripts',
      'Disable AWS CloudTrail to save storage costs',
    ],
    correctIndices: [0, 2],
    explanation:
      'AWS strongly recommends enabling MFA on the root user, deleting root access keys, and using an IAM administrative identity for day-to-day administration.',
    distractorNotes: [
      'Never share root credentials, create root access keys, or disable CloudTrail auditing.',
    ],
  },
  {
    id: 'q-d2-7',
    domain: 'domain-2',
    question:
      'Which AWS service continuously monitors CloudTrail, VPC Flow Logs, and DNS logs for anomalous activity such as cryptocurrency mining or unauthorized API calls?',
    options: [
      'Amazon GuardDuty',
      'AWS CloudFormation',
      'Amazon Cognito',
      'AWS Certificate Manager',
    ],
    correctIndices: [0],
    explanation:
      'Amazon GuardDuty is an intelligent threat detection service that analyzes AWS logs continuously without requiring agents on EC2 instances.',
    distractorNotes: [
      'CloudFormation provisions IaC.',
      'Cognito handles consumer web/mobile user sign-up and sign-in.',
      'ACM provisions SSL/TLS certificates.',
    ],
  },
  {
    id: 'q-d2-8',
    domain: 'domain-2',
    question:
      'How do VPC Security Groups differ from Network ACLs (NACLs)?',
    options: [
      'Security Groups are stateless and operate at the subnet level',
      'Security Groups are stateful and support allow rules only',
      'Network ACLs support allow rules only and operate at the instance level',
      'Network ACLs automatically allow return traffic without outbound rules',
    ],
    correctIndices: [1],
    explanation:
      'Security Groups are stateful (return traffic is automatically permitted), operate at the instance/ENI level, and only support Allow rules. NACLs are stateless, subnet-level, and support Allow + Deny rules.',
    distractorNotes: [
      'All other options swap stateful/stateless or instance/subnet properties.',
    ],
  },
  {
    id: 'q-d2-9',
    domain: 'domain-2',
    question:
      'Which AWS service automatically rotates RDS database passwords and stores API credentials securely?',
    options: [
      'AWS KMS',
      'AWS Secrets Manager',
      'AWS CloudHSM',
      'AWS IAM Access Analyzer',
    ],
    correctIndices: [1],
    explanation:
      'AWS Secrets Manager stores database credentials and API keys encrypted via KMS and supports built-in automatic rotation for RDS, Redshift, and DocumentDB.',
    distractorNotes: [
      'KMS manages cryptographic encryption keys, not application passwords.',
      'CloudHSM provides dedicated single-tenant HSM hardware.',
      'IAM Access Analyzer identifies externally shared resources.',
    ],
  },
  {
    id: 'q-d2-10',
    domain: 'domain-2',
    question:
      'Which service records every AWS Management Console action, CLI command, and API call made in an AWS account for security auditing?',
    options: [
      'Amazon CloudWatch',
      'AWS CloudTrail',
      'AWS Config',
      'Amazon Inspector',
    ],
    correctIndices: [1],
    explanation:
      'AWS CloudTrail captures API-level audit logs ("who did what, when, and from what IP") across your AWS account.',
    distractorNotes: [
      'CloudWatch monitors performance metrics and application logs.',
      'AWS Config tracks resource configuration history and rule compliance.',
      'Inspector scans for software CVEs.',
    ],
  },
  {
    id: 'q-d2-11',
    domain: 'domain-2',
    question:
      'Which service scans Amazon EC2 instances, container images in Amazon ECR, and AWS Lambda functions for known software vulnerabilities (CVEs)?',
    options: [
      'Amazon Inspector',
      'AWS Shield',
      'AWS Artifact',
      'Amazon Rekognition',
    ],
    correctIndices: [0],
    explanation:
      'Amazon Inspector performs automated, continuous vulnerability scanning across EC2, ECR container images, and Lambda functions.',
    distractorNotes: [
      'Shield defends against DDoS; Artifact provides compliance reports; Rekognition analyzes images/video.',
    ],
  },
  {
    id: 'q-d2-12',
    domain: 'domain-2',
    question:
      'Under the Shared Responsibility Model for Amazon RDS, who is responsible for patching the underlying database engine software?',
    options: [
      'The Customer',
      'AWS',
      'AWS Marketplace Partners',
      'Third-party auditors',
    ],
    correctIndices: [1],
    explanation:
      'Amazon RDS is a managed database service: AWS patches the OS and database engine, while the customer manages DB users, schema, network security groups, and encryption settings.',
    distractorNotes: [
      'If you install MySQL directly on EC2, the customer patches both OS and DB engine; on RDS, AWS handles engine/OS patching.',
    ],
  },

  // DOMAIN 3: CLOUD TECHNOLOGY AND SERVICES (34%)
  {
    id: 'q-d3-1',
    domain: 'domain-3',
    question:
      'What is an AWS Availability Zone (AZ)?',
    options: [
      'A single server rack inside a regional facility',
      'One or more discrete data centers with redundant power, networking, and connectivity inside a Region',
      'A caching location used strictly by Amazon CloudFront',
      'A geographic country containing multiple AWS Regions',
    ],
    correctIndices: [1],
    explanation:
      'Each AWS Region consists of multiple isolated Availability Zones (typically 3+), each containing one or more physically separated data centers with independent power and low-latency fiber interconnects.',
    distractorNotes: [
      'Caching locations for CloudFront/Route 53 are Edge Locations.',
    ],
  },
  {
    id: 'q-d3-2',
    domain: 'domain-3',
    question:
      'A company wants to run Docker containers without provisioning, scaling, or patching any underlying EC2 server instances. Which compute option meets this requirement?',
    options: [
      'Amazon EC2 with Auto Scaling',
      'AWS Fargate',
      'AWS Elastic Beanstalk',
      'Amazon Lightsail',
    ],
    correctIndices: [1],
    explanation:
      'AWS Fargate is a serverless compute engine for containers (works with Amazon ECS and EKS) that eliminates managing EC2 clusters.',
    distractorNotes: [
      'EC2, Elastic Beanstalk, and Lightsail all provision virtual server instances under the hood.',
    ],
  },
  {
    id: 'q-d3-3',
    domain: 'domain-3',
    question:
      'A business has unpredictable access patterns for millions of objects in Amazon S3 and wants to automatically optimize storage costs without retrieval fees or performance impact. Which S3 storage class should be used?',
    options: [
      'S3 Standard-IA',
      'S3 One Zone-IA',
      'S3 Intelligent-Tiering',
      'S3 Glacier Flexible Retrieval',
    ],
    correctIndices: [2],
    explanation:
      'Amazon S3 Intelligent-Tiering automatically moves objects between frequent, infrequent, and archive access tiers based on changing access patterns, with zero retrieval fees.',
    distractorNotes: [
      'Standard-IA, One Zone-IA, and Glacier Flexible Retrieval charge retrieval fees when objects are read.',
    ],
  },
  {
    id: 'q-d3-4',
    domain: 'domain-3',
    question:
      'Multiple Linux EC2 instances spread across two Availability Zones need simultaneous read/write access to a shared file system. Which AWS storage service is appropriate?',
    options: [
      'Amazon EBS',
      'Amazon EFS',
      'EC2 Instance Store',
      'AWS Snowcone',
    ],
    correctIndices: [1],
    explanation:
      'Amazon EFS provides elastic, Multi-AZ NFS shared file storage that hundreds of Linux EC2 instances can mount concurrently.',
    distractorNotes: [
      'EBS attaches to a single EC2 instance within a single AZ (for standard volumes); Instance Store is ephemeral local disk.',
    ],
  },
  {
    id: 'q-d3-5',
    domain: 'domain-3',
    question:
      'Which AWS database service is a fully managed NoSQL key-value store designed for consistent single-digit millisecond latency at any scale?',
    options: [
      'Amazon RDS',
      'Amazon Redshift',
      'Amazon DynamoDB',
      'Amazon Aurora',
    ],
    correctIndices: [2],
    explanation:
      'Amazon DynamoDB is a serverless NoSQL key-value and document database engineered for predictable single-digit millisecond latency regardless of table size.',
    distractorNotes: [
      'RDS and Aurora are relational SQL databases; Redshift is a columnar OLAP data warehouse.',
    ],
  },
  {
    id: 'q-d3-6',
    domain: 'domain-3',
    question:
      'A company wants to accelerate global user access to static images and video hosted in an Amazon S3 bucket in us-east-1. Which service should be placed in front of S3?',
    options: [
      'Amazon CloudFront',
      'AWS Direct Connect',
      'Amazon VPC NAT Gateway',
      'AWS Transit Gateway',
    ],
    correctIndices: [0],
    explanation:
      'Amazon CloudFront is AWS’s global Content Delivery Network (CDN), caching copies of S3 content at Edge Locations close to end users worldwide.',
    distractorNotes: [
      'Direct Connect connects an on-premises office to AWS; NAT Gateway and Transit Gateway are VPC routing components.',
    ],
  },
  {
    id: 'q-d3-7',
    domain: 'domain-3',
    question:
      'Which AWS networking component allows EC2 instances inside a private subnet to initiate outbound connections to the internet (e.g., to download software updates) while blocking inbound internet connections?',
    options: [
      'Internet Gateway',
      'NAT Gateway',
      'VPC Peering',
      'Application Load Balancer',
    ],
    correctIndices: [1],
    explanation:
      'A NAT Gateway (placed in a public subnet) translates outbound requests from private subnet instances to the internet while preventing unsolicited inbound traffic.',
    distractorNotes: [
      'An Internet Gateway permits bidirectional traffic for public subnets.',
    ],
  },
  {
    id: 'q-d3-8',
    domain: 'domain-3',
    question:
      'A developer needs to execute short Python scripts in response to API requests, with each execution completing in under 30 seconds. Which AWS compute service requires zero server administration and charges zero when idle?',
    options: [
      'Amazon EC2',
      'AWS Lambda',
      'Amazon Lightsail',
      'AWS Batch',
    ],
    correctIndices: [1],
    explanation:
      'AWS Lambda runs event-driven functions up to 15 minutes per invocation, scales automatically, and bills strictly per request and millisecond of execution.',
    distractorNotes: [
      'EC2 and Lightsail incur charges continuously while running.',
    ],
  },
  {
    id: 'q-d3-9',
    domain: 'domain-3',
    question:
      'Which AWS service allows you to define your entire VPC, EC2, and RDS architecture in a declarative YAML or JSON template for repeatable deployments?',
    options: [
      'AWS CloudFormation',
      'AWS CloudTrail',
      'Amazon CloudWatch',
      'AWS CodeBuild',
    ],
    correctIndices: [0],
    explanation:
      'AWS CloudFormation is AWS’s Infrastructure as Code (IaC) service for modeling and provisioning complete cloud stacks reproducibly.',
    distractorNotes: [
      'CloudTrail audits API calls; CloudWatch monitors metrics/logs; CodeBuild compiles source code.',
    ],
  },
  {
    id: 'q-d3-10',
    domain: 'domain-3',
    question:
      'Which Amazon Route 53 routing policy directs end users to the AWS Region that provides the lowest network delay?',
    options: [
      'Simple routing',
      'Weighted routing',
      'Latency-based routing',
      'Failover routing',
    ],
    correctIndices: [2],
    explanation:
      'Route 53 Latency-based routing measures round-trip network latency between users and AWS Regions to serve traffic from the fastest Region.',
    distractorNotes: [
      'Weighted splits traffic by percentage; Failover switches to a backup endpoint when health checks fail.',
    ],
  },
  {
    id: 'q-d3-11',
    domain: 'domain-3',
    question:
      'A media company wants to automatically extract spoken audio from customer support calls and turn it into searchable text transcripts. Which AWS AI service performs speech-to-text?',
    options: [
      'Amazon Polly',
      'Amazon Transcribe',
      'Amazon Comprehend',
      'Amazon Translate',
    ],
    correctIndices: [1],
    explanation:
      'Amazon Transcribe converts audio speech into accurate text transcripts. (Polly does text-to-speech, Comprehend does NLP sentiment/entities, Translate translates languages.)',
    distractorNotes: [
      'Memory cue: Transcribe = audio TO text; Polly = text TO lifelike speech ("Polly wants a cracker").',
    ],
  },
  {
    id: 'q-d3-12',
    domain: 'domain-3',
    question:
      'Which service helps decouple microservices asynchronously using fully managed message queues so temporary traffic spikes do not overwhelm downstream consumers?',
    options: [
      'Amazon SQS',
      'Amazon Route 53',
      'AWS Glue',
      'Amazon Athena',
    ],
    correctIndices: [0],
    explanation:
      'Amazon Simple Queue Service (SQS) buffers messages reliably between producers and consumers, decoupling microservices and smoothing traffic spikes.',
    distractorNotes: [
      'Route 53 is DNS; Glue is serverless ETL; Athena runs SQL directly on S3.',
    ],
  },
  {
    id: 'q-d3-13',
    domain: 'domain-3',
    question:
      'A financial firm needs a dedicated, private physical fiber connection between its corporate data center and AWS for consistent high throughput that bypasses the public internet. Which service provides this?',
    options: [
      'AWS Site-to-Site VPN',
      'AWS Direct Connect',
      'Amazon CloudFront',
      'Internet Gateway',
    ],
    correctIndices: [1],
    explanation:
      'AWS Direct Connect establishes a dedicated private fiber circuit from your on-premises facility to an AWS Direct Connect location.',
    distractorNotes: [
      'Site-to-Site VPN creates an encrypted IPsec tunnel over the public internet.',
    ],
  },
  {
    id: 'q-d3-14',
    domain: 'domain-3',
    question:
      'Which service enables you to run standard SQL queries directly against petabytes of CSV, JSON, or Parquet files stored in Amazon S3 without loading data into a database?',
    options: [
      'Amazon Athena',
      'Amazon ElastiCache',
      'Amazon RDS',
      'Amazon EBS',
    ],
    correctIndices: [0],
    explanation:
      'Amazon Athena is a serverless interactive query service that lets you analyze data directly in Amazon S3 using standard SQL, paying only per TB scanned.',
    distractorNotes: [
      'ElastiCache is an in-memory cache; RDS requires running relational DB servers.',
    ],
  },

  // DOMAIN 4: BILLING, PRICING, AND SUPPORT (12%)
  {
    id: 'q-d4-1',
    domain: 'domain-4',
    question:
      'A company wants to estimate the monthly AWS bill for a brand-new architecture BEFORE creating any resources or migrating workloads. Which tool should they use?',
    options: [
      'AWS Cost Explorer',
      'AWS Pricing Calculator',
      'AWS Budgets',
      'AWS Cost and Usage Report',
    ],
    correctIndices: [1],
    explanation:
      'AWS Pricing Calculator lets you model prospective architectures and estimate monthly costs before deploying anything.',
    distractorNotes: [
      'Cost Explorer, Budgets, and CUR analyze or alert on actual existing account spend.',
    ],
  },
  {
    id: 'q-d4-2',
    domain: 'domain-4',
    question:
      'An organization needs 24/7 phone and chat technical support with a < 1-hour response SLA for production system outages, plus full AWS Trusted Advisor checks. What is the MOST cost-effective AWS Support plan?',
    options: [
      'AWS Basic Support',
      'AWS Developer Support',
      'AWS Business Support',
      'AWS Enterprise Support',
    ],
    correctIndices: [2],
    explanation:
      'AWS Business Support is the minimum tier providing 24/7 phone/chat/email technical support, < 1 hour Production System Down SLA, and all Trusted Advisor checks.',
    distractorNotes: [
      'Basic has no technical support; Developer only offers business-hours email; Enterprise adds a TAM and < 15 min SLA at $15k+/mo.',
    ],
  },
  {
    id: 'q-d4-3',
    domain: 'domain-4',
    question:
      'Which EC2 purchasing option provides the largest discount (up to 90% off On-Demand) for stateless, fault-tolerant workloads that can withstand a 2-minute interruption notice?',
    options: [
      'On-Demand Instances',
      'Compute Savings Plans',
      'Spot Instances',
      'Dedicated Hosts',
    ],
    correctIndices: [2],
    explanation:
      'EC2 Spot Instances leverage unused EC2 capacity at up to 90% savings, ideal for batch processing, CI/CD, and stateless workers.',
    distractorNotes: [
      'Savings Plans discount up to 66–72% for steady-state 1- or 3-year commitments.',
    ],
  },
  {
    id: 'q-d4-4',
    domain: 'domain-4',
    question:
      'Which AWS Support tier includes a designated Technical Account Manager (TAM) and a < 15-minute response time for business-critical system outages?',
    options: [
      'Developer Support',
      'Business Support',
      'Enterprise Support',
      'Basic Support',
    ],
    correctIndices: [2],
    explanation:
      'AWS Enterprise Support provides a designated Technical Account Manager (TAM), Infrastructure Event Management, and a 15-minute SLA for business-critical outages.',
    distractorNotes: [
      'Only Enterprise (and Enterprise On-Ramp with a pooled TAM) provides a TAM and 15-min SLA.',
    ],
  },
  {
    id: 'q-d4-5',
    domain: 'domain-4',
    question:
      'A finance team wants an automated email notification whenever forecasted monthly AWS spending is projected to exceed $2,000. Which service should they configure?',
    options: [
      'AWS Budgets',
      'AWS Trusted Advisor',
      'AWS Artifact',
      'AWS Pricing Calculator',
    ],
    correctIndices: [0],
    explanation:
      'AWS Budgets lets you set custom cost or usage thresholds (actual or forecasted) and send alerts via email or Amazon SNS.',
    distractorNotes: [
      'Trusted Advisor flags idle resources, not custom forecasted monthly dollar alerts.',
    ],
  },
  {
    id: 'q-d4-6',
    domain: 'domain-4',
    question:
      'Which benefit is unlocked immediately when multiple AWS accounts are consolidated under AWS Organizations?',
    options: [
      'Free AWS Enterprise Support for every linked account',
      'Aggregated volume discounts across accounts and shared Reserved Instance / Savings Plan benefits',
      'Automatic encryption of all existing S3 buckets',
      'Unlimited free outbound internet data transfer',
    ],
    correctIndices: [1],
    explanation:
      'Consolidated Billing in AWS Organizations combines usage across all member accounts so the organization reaches higher volume discount tiers faster and shares RI/Savings Plan discounts.',
    distractorNotes: [
      'Organizations does not grant free Enterprise Support, auto-encrypt S3, or waive internet egress fees.',
    ],
  },
];
