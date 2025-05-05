import { McpServerStatus, McpServerType } from '@/db/schema';

export interface McpServer {
  uuid: string;
  name: string;
  created_at: Date;
  description: string | null;
  command: string | null;
  args: string[];
  env: {
    [key: string]: string;
  };
  profile_uuid: string;
  status: McpServerStatus;
  type: McpServerType;
  url: string | null;
}
