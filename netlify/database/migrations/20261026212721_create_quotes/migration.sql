CREATE TABLE "quotes" (
	"id" serial PRIMARY KEY,
	"document" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
