# TruMove Reaource Marketing

Use /skill:antigravity-workflows  To help /skill:build-ai-agent-system  For You’re right. Here’s the prompt.



AOOS Marketing Platform. 

Build a brand-new application.

This is not a website.

This is not a CRM.

This is the operating system that manages every marketing asset, AI agent, workflow, MCP, connector, repository, scheduler, recommendation, and deployment across the company.

Do not build marketing features first.

Build the operating system those features plug into.

Objective

Create the foundation that will eventually coordinate:

SEO

AEO

GEO

PPC

Meta Ads

Content

Research

Landing Pages

Social

Email

Analytics

Competitor Intelligence

Reputation

AI Workflows

Future marketing modules

The website is only one managed asset.

Phase 1

Do not integrate dozens of APIs yet.

Instead build the operating system.

Workspace 1 — Command Center

This is the home screen.

Display:

Active recommendations

Pending approvals

Running workflows

Connected assets

Connected agents

Connected tools

Recent activity

Overall platform health

This should become the place the operator starts every day.



Workspace 2 — Assets

Everything the platform manages.

Examples:

Website

Research

Landing Pages

Google Ads

Meta Ads

Search Console

Google Analytics

Microsoft Clarity

Google Business Profile

Directories

Email

Social

Future assets

Each asset should have:

Status

Health

Owner

Recent activity

Connected workflows

Connected agents



Workspace 3 — Tool Registry

Every MCP.

Every connector.

Every API.

Every scraper.

Every repository.

Every external service.

Each tool contains:

Name

Description

Category

Authentication

Status

Capabilities

Last run

Configuration

Health

Dependencies

No business logic belongs here.



Workspace 4 — Agent Registry

Every AI worker.

Each agent has:

Purpose

Description

Tools

Permissions

Memory Scope

Available Workflows

Current Tasks

Status

Health



Workspace 5 — Workflow Registry

Visual workflows.

Examples:

Research Refresh

Content Refresh

SEO Audit

Competitor Monitoring

Technical SEO

Publishing

Landing Page Generation

Schema Validation

Future workflows

Agents participate in workflows.

Workflows do not contain agent implementations.



Workspace 6 — Recommendation Queue

The most important screen.

Every recommendation includes:

Title

Description

Business impact

Confidence

Reasoning

Dependencies

Suggested action

Affected assets

Approval required

Current status

Nothing deploys automatically.



Workspace 7 — Scheduler

Every scheduled task.

Status

Health

Last run

Next run

Duration

Failures

Logs

Manual run



Workspace 8 — Activity

One chronological timeline.

Everything happens here.

Research updated.

Workflow completed.

Recommendation generated.

Deployment approved.

Publishing finished.

Job failed.

Dataset refreshed.

Everything.



Architecture Rules

Everything must be modular.

Every MCP must register itself.

Every connector must register itself.

Every AI agent must register itself.

Every workflow must register itself.

Nothing should require modifying core code to add a new capability.

The platform should discover capabilities through registries rather than hardcoded integrations.



Future

This platform will eventually coordinate:

Website publishing

Research platform

Marketing automation

SEO

AEO

Competitor monitoring

Paid advertising

Analytics

Content generation

Agentic workflows

Autonomous recommendations

Do not build those systems yet.

Build the operating system that they will plug into.



UI

Premium enterprise software.

Minimal.

Dark.

Professional.

Calm.

No clutter.

No fake dashboards.

No placeholder analytics.

Every screen should have a clear operational purpose.



Before Writing Code

Present:

Information architecture

Navigation

Database design

Registry architecture

Workflow model

Agent model

Recommendation lifecycle

Scheduler model

Activity model

Folder structure

Wait for approval before implementation.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4aa4b3cf-b3ab-4721-aff6-e0d55ce13276).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
