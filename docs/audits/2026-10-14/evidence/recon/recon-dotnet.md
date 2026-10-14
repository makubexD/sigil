dotnet/skills: 17 plugins, 112 skills (median ~12KB), ~128 reference files (1 level deep enforced), 16 agents, LSP server. No rules/hooks.
Desc "USE FOR / DO NOT USE FOR" (74/112) naming sibling handoffs. Router csharp-expert. csharp-refactoring: classify gate, verify proportionally, consolidate toward existing source of truth.
Catalog format Smell/Why bad/Fix (msbuild-antipatterns). Validator: token sizing cl100k sweet 200-2500, warn >5000; ref depth.
Evals: baseline vs isolated vs plugin, sign test p<=.05, >=5 stimuli; expect_activation:false dormancy; overfitting judge; 22 underpowered allowlisted; Vally not public.
Overlays pilot: target repo .agents/skill-overlays/<plugin>/<skill>.md, core+binding-revision+mode:extend; may narrow, never widen perms; precedence user > project constraints > overlay > defaults; mismatch -> report + fallback.
Gaps: no design/naming/anti-overengineering skill; size variance.
