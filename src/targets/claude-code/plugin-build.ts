/**
 * Pack membership for the Claude Code plugin build: which catalog artifacts a pack's plugin
 * holds. The files themselves are written by plugin-assemble.ts through the plugin-channel
 * specs (src/targets/emit-files.ts); skills there inline their rules, because a plugin can't ship
 * loose rule files.
 */
export { configPluginName, getPackArtifacts } from '../shared/plugin-packs';
