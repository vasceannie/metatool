CREATE TABLE "tools" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"tool_schema" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mcp_server_uuid" uuid NOT NULL,
	CONSTRAINT "tools_unique_tool_name_per_server_idx" UNIQUE("mcp_server_uuid","name")
);
--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_mcp_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("mcp_server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tools_mcp_server_uuid_idx" ON "tools" USING btree ("mcp_server_uuid");