import { ToggleStatus } from '@/db/schema';

export interface Tool {
  uuid: string;
  name: string;
  description: string | null;
  toolSchema: {
    type: 'object';
    properties?: Record<string, any>;
  };
  created_at: Date;
  mcp_server_uuid: string;
  status: ToggleStatus;
}
