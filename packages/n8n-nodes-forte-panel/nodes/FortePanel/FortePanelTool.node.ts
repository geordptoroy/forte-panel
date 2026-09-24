import type { INodeTypeDescription } from 'n8n-workflow';
import { FortePanel } from './FortePanel.node';

/**
 * Explicit compatibility registration for n8n 2.x workflows that persist
 * the AI-tool node as n8n-nodes-forte-panel.fortePanelTool.
 *
 * The base FortePanel node remains the usableAsTool node. This compatibility
 * registration intentionally omits usableAsTool so n8n does not generate the
 * invalid fortePanelToolTool type.
 */
export class FortePanelTool extends FortePanel {
  declare description: INodeTypeDescription;

  constructor() {
    super();
    const { usableAsTool: _usableAsTool, ...baseDescription } = this.description;
    this.description = {
      ...baseDescription,
      displayName: 'Forte Panel Tool',
      name: 'fortePanelTool',
    };
  }
}
