CREATE TABLE "supplier_products" (
	"id" serial PRIMARY KEY,
	"supplier" text NOT NULL,
	"key" text NOT NULL,
	"ref" text DEFAULT '' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"brand" text DEFAULT '' NOT NULL,
	"path" jsonb NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"pvp" double precision NOT NULL,
	"net" double precision,
	"discount" double precision,
	"stock" boolean,
	"prev_pvp" double precision,
	"prev_net" double precision,
	"changed_at" timestamp with time zone,
	"net_at" timestamp with time zone,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_products_key_idx" ON "supplier_products" ("supplier","key");--> statement-breakpoint
CREATE INDEX "supplier_products_net_at_idx" ON "supplier_products" ("supplier","net_at");