import type { INodeTypeDescription } from 'n8n-workflow';
import { FortePanel } from './FortePanel.node';

/**
 * Compatibility node for workflows created with the historical
 * n8n-nodes-forte-panel.fortePanelTool type.
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
      usableAsTool: true,
    };
  }
}
