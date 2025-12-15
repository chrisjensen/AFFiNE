-- CreateTable
CREATE TABLE "workspace_spaces" (
    "id" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "name" VARCHAR NOT NULL,
    "description" VARCHAR,
    "avatar_key" VARCHAR,
    "default_role" SMALLINT NOT NULL DEFAULT 30,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workspace_spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_user_permissions" (
    "space_id" VARCHAR NOT NULL,
    "user_id" VARCHAR NOT NULL,
    "type" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "space_user_permissions_pkey" PRIMARY KEY ("space_id","user_id")
);

-- CreateTable
CREATE TABLE "space_docs" (
    "space_id" VARCHAR NOT NULL,
    "doc_id" VARCHAR NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "space_docs_pkey" PRIMARY KEY ("space_id","doc_id")
);

-- CreateIndex
CREATE INDEX "workspace_spaces_workspace_id_idx" ON "workspace_spaces"("workspace_id");

-- CreateIndex
CREATE INDEX "space_user_permissions_user_id_idx" ON "space_user_permissions"("user_id");

-- CreateIndex
CREATE INDEX "space_docs_doc_id_idx" ON "space_docs"("doc_id");

-- AddForeignKey
ALTER TABLE "workspace_spaces" ADD CONSTRAINT "workspace_spaces_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_user_permissions" ADD CONSTRAINT "space_user_permissions_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "workspace_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_user_permissions" ADD CONSTRAINT "space_user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_docs" ADD CONSTRAINT "space_docs_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "workspace_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
