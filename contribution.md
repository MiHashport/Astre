# CONTRIBUTING.md

## Introduction

Thank you for your interest in contributing to **Nevo**!
We welcome contributions from developers of all backgrounds. This document outlines the process and rules to ensure a smooth and consistent contribution workflow.

---

## Getting Started

### 1. Fork the Repository

Fork the repository to your GitHub account:

```
https://github.com/Web3Novalabs/Nevo
```

### 2. Clone Your Fork

```bash
git clone https://github.com/YOUR-USERNAME/Nevo.git
cd Nevo
```

### 3. Create a Branch

```bash
git checkout -b feature/issue-<issue-number>
```

---

## Project Structure

The repository is organized into three main folders:

* **Frontend** → Next.js application
* **Backend** → NestJS API
* **Contract** → Smart contract code

Each GitHub issue will clearly belong to **one and only one** of these folders.

---

## Contribution Rules

### Issue-Based Work

* Every contribution **must be tied to a GitHub issue**
* Issues are created and scoped by maintainers
* Follow the issue description carefully

### Single-Folder Rule (IMPORTANT)

* Only modify **one** of the following per PR:

  * Frontend
  * Backend
  * Contract
* Do NOT mix changes across multiple folders in a single PR

### Minimal Changes

* Only modify files necessary to solve the issue
* Avoid touching unrelated code
* Keep PRs focused and clean

---

## Frontend Contributions (Next.js)

When working in the `Frontend` folder:

* Ensure the project builds successfully
* Ensure UI is responsive across screen sizes
* Follow consistent formatting and styling
* Limit changes to:

  * The new page folder being implemented, or
  * The relevant `page.tsx` (or main page file)

---

## Backend Contributions (NestJS)

When working in the `Backend` folder:

* Ensure the backend builds successfully
* Follow proper code formatting
* Only modify:

  * The specific module
  * Controller
  * Service related to the issue

---

## Contract Contributions

When working in the `Contract` folder:

* Ensure contracts compile/build successfully
* Ensure **all tests pass**
* Follow strict formatting rules
* Only modify:

  * The main contract file/module being updated
  * Relevant test files

> ⚠️ Contract contributions are stricter due to security and immutability concerns.

---

## Handling Dependencies & Unimplemented Features

### Scenario 1: Feature Not Implemented

If your issue depends on a feature (from another GitHub issue) that hasn't been implemented yet:

* **Do NOT wait** for the other issue to be completed
* Instead, create a **minimal mock** of only what you need
* Your mock should:
  * Provide exactly the API or interface your feature requires
  * Return hardcoded or placeholder data
  * Be clearly marked as a mock (use comments, type names like `MockService`, or clear naming)
  * NOT attempt to implement the full scope of the dependent feature
* Concrete examples:
  * **Backend API dependency**: Create an endpoint that returns hardcoded JSON data
  * **Contract function dependency**: Create a function that returns sample contract data
  * **External service dependency**: Mock the API responses with hardcoded data
  * **Database queries**: Mock the query results with sample data

### Scenario 2: Issue Explicitly Depends on Another Issue

When your issue is linked to another GitHub issue:

* Create a **minimal mock version** of that dependency
* The mock only needs to provide the minimal data or behavior your feature requires
* Clearly mark it: `// TODO: Replace with real implementation from issue #XYZ`
* Do NOT implement the full scope of the dependent issue—only mock what you need
* When the dependency is complete, maintainers will replace your mock with the real implementation

### The Bottom Line

* **You can complete your issue independently** without waiting for dependencies
* **Mocks are temporary**—they're clearly marked and will be replaced later
* **Focus on your feature**—use mock data to make it work
* **Maintainers handle cleanup**—they'll replace mocks with real implementations when dependencies are ready

---

## Code Quality

* Follow the existing code style
* Keep code clean and readable
* Write meaningful commit messages
* Ensure no build errors before submitting PR

---

## Submitting a Pull Request

1. Push your branch:

```bash
git push origin feature/issue-<issue-number>
```

2. Open a Pull Request against the main repository

3. In your PR:

* Reference the issue (`Closes #<issue-number>`)
* Clearly describe what was changed
* Confirm:

  * Build passes
  * Tests pass (if applicable)
  * Scope is limited to one folder

---

## Review Process

* Maintainers will review your PR
* Feedback may require changes before merging
* Once approved, your PR will be merged

---

## Final Notes

* Respect the project structure and rules
* Keep contributions focused and minimal
* When in doubt, ask for clarification in the issue

---

Thank you for contributing to Nevo 🚀
