import type { INodeProperties, INodeTypeDescription } from 'n8n-workflow';
import { FortePanel } from './FortePanel.node';

type FixedNodeConfig = {
  operation: string;
  displayName: string;
  name: string;
  fields: string[];
};

function defaultFor(property: INodeProperties): unknown {
  if (property.name === 'provider') return 'papi';
  if (property.name === 'messageType') return 'text';
  if (property.type === 'json') return '{}';
  if (property.type === 'number') return 0;
  return '';
}

function buildProperties(properties: INodeProperties[], config: FixedNodeConfig): INodeProperties[] {
  const allowed = new Set(config.fields);
  return properties
    .filter((property) => property.name !== 'operation' && allowed.has(property.name))
    .map((property) => ({ ...property, default: defaultFor(property) as INodeProperties['default'] }));
}

abstract class FixedFortePanelNode extends FortePanel {
  constructor(config: FixedNodeConfig) {
    super();
    const { usableAsTool: _usableAsTool, ...baseDescription } = this.description;
    this.description = {
      ...baseDescription,
      displayName: config.displayName,
      name: config.name,
      subtitle: config.operation,
      description: `Node determinístico do Forte Panel para ${config.displayName.toLowerCase()}.`,
      properties: buildProperties(this.description.properties ?? [], config),
    } as INodeTypeDescription;
  }
}

export class FortePanelBuscarLead extends FixedFortePanelNode {
  constructor() {
    super({ operation: 'buscar_lead', displayName: 'Forte Panel - Buscar Lead', name: 'fortePanelBuscarLead', fields: ['phone', 'idempotencyKey'] });
  }
}

export class FortePanelCriarLead extends FixedFortePanelNode {
  constructor() {
    super({ operation: 'criar_lead', displayName: 'Forte Panel - Criar Lead', name: 'fortePanelCriarLead', fields: ['phone', 'name', 'fields', 'idempotencyKey'] });
  }
}

export class FortePanelAtualizarLead extends FixedFortePanelNode {
  constructor() {
    super({ operation: 'atualizar_lead', displayName: 'Forte Panel - Atualizar Lead', name: 'fortePanelAtualizarLead', fields: ['phone', 'name', 'fields', 'idempotencyKey'] });
  }
}

export class FortePanelRegistrarNota extends FixedFortePanelNode {
  constructor() {
    super({ operation: 'registrar_nota', displayName: 'Forte Panel - Registrar Nota', name: 'fortePanelRegistrarNota', fields: ['phone', 'note', 'idempotencyKey'] });
  }
}

export class FortePanelDisponibilidade extends FixedFortePanelNode {
  constructor() {
    super({ operation: 'availability', displayName: 'Forte Panel - Consultar Disponibilidade', name: 'fortePanelAvailability', fields: ['startsAt', 'serviceId', 'professionalId', 'idempotencyKey'] });
  }
}

export class FortePanelCriarAgendamento extends FixedFortePanelNode {
  constructor() {
    super({ operation: 'create_appointment', displayName: 'Forte Panel - Criar Agendamento', name: 'fortePanelCreateAppointment', fields: ['contactId', 'serviceId', 'professionalId', 'startsAt', 'endsAt', 'notes', 'idempotencyKey'] });
  }
}

export class FortePanelCancelarAgendamento extends FixedFortePanelNode {
  constructor() {
    super({ operation: 'cancel_appointment', displayName: 'Forte Panel - Cancelar Agendamento', name: 'fortePanelCancelAppointment', fields: ['appointmentId', 'idempotencyKey'] });
  }
}

export class FortePanelReagendar extends FixedFortePanelNode {
  constructor() {
    super({ operation: 'reschedule_appointment', displayName: 'Forte Panel - Reagendar', name: 'fortePanelRescheduleAppointment', fields: ['appointmentId', 'startsAt', 'endsAt', 'idempotencyKey'] });
  }
}

export class FortePanelPromptPublicado extends FixedFortePanelNode {
  constructor() {
    super({ operation: 'published_prompt', displayName: 'Forte Panel - Prompt Publicado', name: 'fortePanelPublishedPrompt', fields: ['idempotencyKey'] });
  }
}

export class FortePanelEnfileirarMensagem extends FixedFortePanelNode {
  constructor() {
    super({ operation: 'queue_message', displayName: 'Forte Panel - Enfileirar Mensagem', name: 'fortePanelQueueMessage', fields: ['contactId', 'phone', 'name', 'content', 'provider', 'messageType', 'instanceId', 'metadata', 'idempotencyKey'] });
  }
}
