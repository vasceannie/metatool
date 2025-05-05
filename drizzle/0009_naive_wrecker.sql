ALTER TABLE "tools" DROP CONSTRAINT "tools_mcp_server_uuid_mcp_servers_uuid_fk";
--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_mcp_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("mcp_server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;