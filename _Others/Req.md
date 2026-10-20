# Mission: Design a Modular, Language-Aware AI Engineering Framework

## 1. Role and objective

Act as a Principal Software Architect, Staff Software Engineer, AI Agent Framework Architect, and repository analyst.

Your mission is to analyze four existing local Git repositories and design a cohesive, modular, extensible AI-assisted software engineering framework that maximizes code quality, maintainability, correctness, performance, security, and development efficiency while minimizing unnecessary complexity, duplication, and AI token consumption.

This is NOT a greenfield implementation.

The repositories already contain potentially valuable skills, agents, rules, workflows, prompts, scripts, and engineering practices. Your first responsibility is to understand, classify, evaluate, and preserve their value before proposing changes.

The ultimate objective is to build a reusable engineering framework that helps AI coding agents produce consistently excellent, production-ready code across different programming languages, frameworks, architectures, and project types.

"Perfect code" is an aspiration, not a literal guarantee. Optimize for measurable quality, sound engineering judgment, explicit trade-offs, and evidence-based decisions.

## 2. Repositories to analyze

All four repositories have already been downloaded locally.

- ECC: https://github.com/affaan-m/ECC
- .NET Skills: https://github.com/dotnet/skills
- Agent Skills: https://github.com/addyosmani/agent-skills
- Ponytail: https://github.com/dietrichgebert/ponytail

Local repository paths:

- ECC: C:\WorkSpaceMaku\Others\ECC
- .NET Skills: C:\WorkSpaceMaku\Others\skills
- Agent Skills: C:\WorkSpaceMaku\Others\agent-skills
- Ponytail: C:\WorkSpaceMaku\Others\ponytail

Use the local directories as the primary source of truth. Do not assume that repository contents match their current online versions.

Inspect available Git metadata, documentation, manifests, configuration files, scripts, tests, skills, agents, rules, and other relevant artifacts.

If a path is missing or inaccessible, report it explicitly. Never fabricate repository contents or claim to have inspected files you have not read.

## 3. Operating constraints

During the initial analysis:

- Work in READ-ONLY mode.
- Do not modify, delete, move, rename, or overwrite existing repository files.
- Do not install dependencies or execute potentially destructive scripts.
- Do not make network requests unless explicitly necessary and permitted.
- Do not merge repositories or copy artifacts between them.
- Do not generate a large collection of speculative skills or agents.
- Do not assume a particular AI coding platform is the sole target.
- Do not treat every existing component as valuable simply because it already exists.
- Do not replace a working solution merely because a different implementation looks cleaner.

You may create a separate analysis report outside the source repositories if an appropriate output directory is provided. Otherwise, present the findings without writing files.

If any future implementation would modify existing files, require a separate implementation phase and explicit authorization.

## 4. Engineering principles

The resulting framework must promote the following principles through actionable guidance, not merely repeat their names.

### Core principles

- SOLID, applied where it provides real value.
- DRY, while recognizing that premature abstraction and inappropriate deduplication are harmful.
- YAGNI, avoiding speculative requirements, unnecessary layers, and unused abstractions.
- KISS, favoring the simplest solution that correctly satisfies the requirements.
- Clean Code, with readable names, focused functions, clear responsibilities, and low cognitive complexity.
- Appropriate object-oriented design, including encapsulation, composition, polymorphism, and justified use of inheritance.
- Functional programming techniques where they improve correctness, composability, and testability.
- Appropriate data structures and algorithms based on access patterns, complexity, memory use, and workload.
- Separation of concerns, modularity, high cohesion, and low coupling.
- Dependency inversion and dependency injection when justified by architectural needs.
- Explicit error handling, meaningful observability, and predictable behavior.
- Security by design, input validation, least privilege, and safe handling of secrets.
- Automated testing, regression prevention, and maintainable test architecture.
- Accessibility, compatibility, and resilience where relevant.
- Performance and scalability appropriate to actual requirements.
- Consistency with existing project conventions and established architectural decisions.

### Mandatory decision rule

Never interpret these principles as absolute rules that override engineering judgment.

For every significant recommendation, distinguish between:

1. A genuine defect or measurable risk.
2. A maintainability improvement with a clear benefit.
3. A context-dependent trade-off.
4. A stylistic preference.
5. An unnecessary abstraction or speculative optimization.

Prefer evidence and concrete examples over dogma.

Do not introduce interfaces, factories, repositories, services, managers, adapters, or additional architectural layers unless their benefits justify their costs.

Avoid both underengineering and overengineering.

## 5. Phase 1 — Repository reconnaissance

Analyze each repository independently before attempting to unify anything.

For each repository, determine:

- Its primary purpose and intended users.
- The problems it attempts to solve.
- Its major architectural concepts and design philosophy.
- Its directory structure and important artifacts.
- The roles of its skills, agents, rules, commands, hooks, scripts, and workflows, where present.
- Its target AI platforms and any platform-specific assumptions.
- Its supported languages, frameworks, and engineering disciplines.
- How components are invoked, composed, or reused.
- Whether it supports specification-driven development, planning, implementation, verification, review, or other lifecycle stages.
- How it promotes code quality, testing, security, performance, and maintainability.
- Its configuration and customization mechanisms.
- Its testing, validation, documentation, and maintenance practices.
- Its token usage implications, including context-heavy instructions, duplicated guidance, and unnecessary agent invocation.
- Its limitations, missing capabilities, and potential maintenance burden.

Inspect representative artifacts in depth, but do not stop at README files or repository overviews. Follow references into actual implementations and configuration.

Determine which components are genuinely reusable, which are platform-specific, and which depend on undocumented assumptions.

### Deliverable A: Repository profiles

Produce one profile per repository containing:

- Purpose and scope.
- Core capabilities.
- Architectural model.
- Key components and responsibilities.
- Strengths and weaknesses.
- Important dependencies and compatibility constraints.
- Notable implementation details, supported by file paths.
- Reusable assets.
- Areas requiring further investigation.

Cite specific local file paths for important findings. Distinguish verified facts from inferences and unresolved questions.

## 6. Phase 2 — Capability inventory and separation of concerns

Create a normalized inventory of relevant capabilities across all four repositories.

Classify each capability by its primary responsibility, regardless of its existing filename or directory.

Use categories such as:

- Specification-driven development.
- Requirements analysis and clarification.
- Architecture and technical design.
- Planning and task decomposition.
- Implementation and refactoring.
- Language-specific engineering.
- Framework-specific engineering.
- Code review and quality assurance.
- Testing and test generation.
- Debugging and root-cause analysis.
- Security and dependency auditing.
- Performance and algorithmic analysis.
- Documentation and developer experience.
- Git, CI/CD, and release workflows.
- Agent orchestration and delegation.
- Context management and token optimization.
- Repository exploration and knowledge retrieval.

Treat these categories as a starting point, not a mandatory taxonomy. Add, remove, or reorganize categories based on evidence.

For every significant existing capability, identify:

- Its source repository and exact path.
- Its actual responsibility.
- Its trigger or invocation mechanism.
- Its dependencies.
- Its inputs and outputs.
- Its scope: universal, language-specific, framework-specific, lifecycle-specific, or platform-specific.
- Its overlaps with other components.
- Whether it should be reused, wrapped, composed, extended, consolidated, deprecated, or left unchanged.

### Deliverable B: Capability matrix

Produce a cross-repository matrix that reveals:

- Unique capabilities.
- Duplicate capabilities.
- Complementary capabilities.
- Conflicting instructions.
- Missing capabilities.
- Platform-specific implementations of otherwise portable concepts.
- Existing functionality that should remain authoritative.

Do not declare two components duplicates merely because they share a name. Compare their actual behavior, scope, quality, and invocation conditions.

## 7. Phase 3 — Evaluate the existing specification-driven development workflow

Specification-driven development is a priority.

Identify which repository or components already provide a mature specification-driven development workflow.

Evaluate the actual workflow, including its lifecycle stages, artifacts, transitions, validation, and enforcement mechanisms.

Determine:

- What works well and should be preserved.
- What capabilities are missing.
- Which additional skills or agents would genuinely improve it.
- Which proposed improvements should be implemented as wrappers, extensions, optional checks, or independent capabilities.
- Whether any proposed addition duplicates existing behavior.
- How the workflow can remain usable across different languages and frameworks.
- How it handles changes to requirements, architecture, scope, and implementation plans.
- How it validates that implementation matches the specification.
- How it prevents unnecessary planning, excessive documentation, and repeated analysis.

Do not redesign the workflow from scratch if the existing implementation already solves the problem effectively.

Prefer small, composable extensions with explicit interfaces and clear responsibilities.

### Deliverable C: Specification-driven development assessment

Document the current lifecycle, its authoritative components, gaps, proposed extensions, and the rationale for each change.

Separate required improvements from optional enhancements.

## 8. Phase 4 — Design the target framework

Propose a modular architecture for the unified framework.

The architecture should separate the following concerns where justified.

### A. Universal engineering standards

Language-agnostic principles and decision-making guidance, including design quality, simplicity, maintainability, testing strategy, security, performance, and error handling.

### B. Development lifecycle orchestration

Requirements, specifications, architecture, planning, implementation, validation, review, and delivery.

Reuse existing specification-driven development capabilities whenever possible.

### C. Language-specific engineering knowledge

Provide tailored guidance for:

- TypeScript.
- Node.js.
- Angular.
- React.
- C# and .NET.
- Python.

Recognize that these are overlapping dimensions rather than six mutually exclusive languages.

For example, a TypeScript React application should be able to use universal engineering standards, TypeScript guidance, React-specific guidance, and the relevant development workflow without loading unrelated Angular or .NET instructions.

Account for project-specific versions, established conventions, and supported tooling.

### D. Framework and ecosystem-specific capabilities

Cover framework-specific architecture, APIs, testing, dependency management, build systems, runtime behavior, performance, and idiomatic implementation patterns.

Do not duplicate universal principles in every framework-specific component. Reference shared guidance where the target platform permits it.

### E. Skills, agents, rules, hooks, and automation

Define the responsibility and appropriate use of each mechanism.

Consider the following distinctions:

- Rules establish persistent constraints and concise defaults.
- Skills provide reusable, task-specific procedures and domain knowledge.
- Agents handle specialized work when delegation provides a meaningful benefit.
- Hooks enforce deterministic checks or trigger actions at appropriate lifecycle points.
- Scripts and tools perform deterministic operations better handled by automation.
- Workflows coordinate multiple steps when their ordering, state, or validation matters.

These are proposed conceptual responsibilities, not assumptions about the capabilities of every AI platform.

Verify what each target platform actually supports before deciding how to implement a capability.

Do not create an agent where a concise rule, skill, or deterministic tool would be sufficient.

### Deliverable D: Target architecture

Provide:

- A conceptual architecture diagram.
- Component boundaries and responsibilities.
- Dependency and composition rules.
- A proposed directory structure.
- Invocation and activation strategies.
- Platform compatibility considerations.
- A migration strategy from existing repositories.
- Decisions that remain unresolved and require user input.

## 9. Phase 5 — Build a reusable engineering catalog

Design a catalog of candidate rules, skills, agents, hooks, and tools.

Do not generate every candidate immediately. First establish the taxonomy, assess gaps, and rank candidates by value.

For each proposed catalog entry, define:

- Unique identifier and descriptive name.
- Component type.
- Primary responsibility.
- Scope and supported technologies.
- Trigger conditions.
- Required inputs and expected outputs.
- Dependencies and related components.
- Whether activation is automatic, explicit, or conditional.
- Whether it needs repository context.
- Its expected token and execution cost.
- Its validation strategy.
- Its overlap with existing components.
- Its rationale and expected benefit.
- Its priority and implementation effort.

Use explicit acceptance criteria and representative test cases for important components.

Prefer small, focused capabilities that compose predictably over large, generic agents that attempt to solve every engineering problem.

The catalog must support future additions without requiring architectural changes for every new language or framework.

## 10. Phase 6 — Language-specific quality standards

Design a reusable template for language-specific engineering guidance, then evaluate its application to each target ecosystem.

For every language or framework, investigate the relevant:

- Idiomatic language features and conventions.
- Type-system capabilities and appropriate type safety.
- Object-oriented and functional design trade-offs.
- Appropriate data structures and algorithmic complexity.
- Resource management and lifecycle concerns.
- Concurrency and asynchronous execution.
- Error handling and observability.
- Dependency and package management.
- Testing frameworks and testing architecture.
- Static analysis, linting, formatting, and type checking.
- Security and common ecosystem-specific vulnerabilities.
- Performance profiling and optimization.
- Framework conventions and version-specific best practices.

Examples of areas to investigate include:

- TypeScript: type modeling, strictness, narrowing, generics, and avoiding unnecessary type assertions.
- Node.js: asynchronous I/O, event-loop behavior, resource management, and concurrency limitations.
- Angular: dependency injection, component boundaries, reactive state, RxJS where appropriate, and lifecycle management.
- React: component composition, state ownership, rendering behavior, effects, and appropriate memoization.
- C#/.NET: type design, generics, LINQ, async/await, IDisposable/IAsyncDisposable, and dependency injection.
- Python: idiomatic data structures, type hints, context managers, iteration, exception handling, and appropriate use of classes versus functions.

Treat these examples as investigation topics rather than unconditional prescriptions.

Avoid forcing the same architectural patterns into every ecosystem. Recommend the simplest idiomatic design that meets the actual requirements.

## 11. Phase 7 — Conflict resolution and precedence

Define a predictable precedence model for instructions and guidance.

The design must explain how to resolve conflicts between:

- Explicit user requirements.
- Repository-specific architectural decisions.
- Existing project conventions.
- Universal engineering principles.
- Language-specific guidance.
- Framework-specific guidance.
- Workflow-specific requirements.
- Automated quality gates.

Do not assume that one instruction file or component can automatically override another on every platform.

Distinguish conceptual precedence from actual runtime enforcement.

Define how contradictions should be detected, reported, and resolved. Do not silently combine incompatible instructions.

Existing project requirements and verified constraints must not be overridden by generic advice without justification.

## 12. Phase 8 — Token efficiency and execution cost

The framework must optimize engineering quality per unit of context, execution time, and cost.

Investigate and recommend:

- Concise, always-loaded rules.
- On-demand skills and specialized knowledge.
- Conditional agent invocation.
- Avoidance of duplicated instructions.
- Reuse of repository analysis and available context.
- Targeted file exploration instead of repeatedly scanning entire repositories.
- Deterministic scripts for repetitive checks.
- Bounded agent delegation and output sizes.
- Clear stop conditions and escalation rules.
- Avoidance of redundant planning, reviews, and verification.
- Separation of cheap deterministic checks from expensive reasoning.
- Caching or persistent repository knowledge only where reliable and beneficial.

Do not equate lower token usage with better engineering.

Optimize for total cost and quality, considering unnecessary model calls, context growth, rework, missed defects, and the cost of maintaining the framework.

For every expensive or always-active mechanism, justify why it is necessary and when it should run.

## 13. Phase 9 — Validation and evidence

Every important recommendation must be testable.

Design a validation strategy that evaluates both individual components and the framework as a whole.

Include:

- Structural and schema validation.
- Link and reference validation.
- Duplicate and conflicting instruction detection.
- Component activation and composition tests.
- Representative coding tasks for each supported ecosystem.
- Tests for common engineering mistakes.
- Tests for overengineering and unnecessary abstraction.
- Regression tests for existing specification-driven workflows.
- Token and execution-cost measurements where practical.
- A comparison against an unmodified baseline.

Use measurable outcomes where feasible, including correctness, test quality, maintainability, security findings, unnecessary complexity, task completion, and cost.

Do not claim that a component improves code quality merely because its prompt sounds convincing.

Distinguish subjective review from automated verification and measured outcomes.

## 14. Phase 10 — Prioritized implementation roadmap

After completing the analysis and architectural design, propose a phased roadmap.

Prioritize work based on:

- Engineering impact.
- Confidence in the findings.
- Reuse of existing assets.
- Implementation effort.
- Compatibility risk.
- Maintenance burden.
- Token and execution cost.
- Dependencies between changes.

Prefer a minimum viable framework that delivers measurable value before expanding the catalog.

Identify:

1. Existing capabilities to preserve.
2. Immediate high-value integrations.
3. Critical missing capabilities.
4. Redundant or conflicting components to consolidate.
5. Language-specific gaps.
6. Optional future enhancements.

For each proposed change, provide the source evidence, intended result, acceptance criteria, estimated complexity, and dependencies.

Do not implement the roadmap during this analysis.

## 15. Required final deliverables

Produce the following deliverables in order:

1. Executive summary and principal findings.
2. Repository profiles.
3. Cross-repository capability inventory.
4. Separation-of-concerns and overlap matrix.
5. Specification-driven development assessment.
6. Target architecture and proposed directory structure.
7. Component taxonomy and interaction model.
8. Prioritized catalog of candidate rules, skills, agents, hooks, and tools.
9. Language-specific engineering coverage matrix.
10. Instruction precedence and conflict-resolution policy.
11. Token and execution-cost optimization strategy.
12. Validation strategy and representative acceptance tests.
13. Prioritized implementation roadmap.
14. Risks, assumptions, unresolved questions, and decisions requiring approval.

Include a traceability matrix connecting each significant recommendation to the repository evidence that supports it.

Use tables when they make comparisons clearer. Use diagrams when they clarify component boundaries or workflows. Keep summaries concise, but provide enough technical detail for implementation.

## 16. Working protocol and quality gates

Work incrementally.

At each phase:

1. State the objective and scope.
2. Gather evidence from the local repositories.
3. Summarize findings.
4. Identify uncertainties and assumptions.
5. Produce the required deliverable.
6. Validate consistency with previous findings.
7. Identify the next phase and its dependencies.

Do not skip ahead to implementation because a potential solution appears obvious.

Do not stop at a superficial inventory if deeper inspection is necessary to understand the behavior of important components.

If the repositories are too large to inspect completely within available context, use a systematic, evidence-driven sampling strategy and explicitly disclose the coverage limitations.

Do not claim completeness without evidence.

Before finalizing the architecture, verify that:

- Every major responsibility has a clear owner.
- Every proposed reusable capability has a defined scope.
- Existing valuable functionality is preserved.
- Unnecessary duplication has been identified.
- Language-specific guidance remains idiomatic.
- Platform-specific assumptions are isolated.
- Components compose without contradictory instructions.
- The framework avoids unnecessary agent calls and persistent context.
- Proposed improvements have testable acceptance criteria.
- No implementation changes have been made.

## 17. First action

Begin with Phase 1: repository reconnaissance.

Confirm the four local paths are accessible, inspect their structures and key documentation, and investigate their actual implementations.

Then produce the initial repository profiles and identify the most important questions that must be answered before designing the unified architecture.

Remain in read-only analysis mode until explicitly authorized to proceed with implementation.