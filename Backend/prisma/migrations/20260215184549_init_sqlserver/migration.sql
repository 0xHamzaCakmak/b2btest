BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[users] (
    [id] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000) NOT NULL,
    [password_hash] NVARCHAR(1000) NOT NULL,
    [role] NVARCHAR(1000) NOT NULL,
    [branch_id] NVARCHAR(1000),
    [is_active] BIT NOT NULL CONSTRAINT [users_is_active_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [users_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [users_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [users_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[branches] (
    [id] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [manager] NVARCHAR(1000),
    [phone] NVARCHAR(1000),
    [email] NVARCHAR(1000),
    [address] NVARCHAR(1000),
    [is_active] BIT NOT NULL CONSTRAINT [branches_is_active_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [branches_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [branches_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[products] (
    [id] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [base_price] DECIMAL(12,2) NOT NULL,
    [is_active] BIT NOT NULL CONSTRAINT [products_is_active_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [products_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [products_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [products_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[branch_price_adjustments] (
    [id] NVARCHAR(1000) NOT NULL,
    [branch_id] NVARCHAR(1000) NOT NULL,
    [percent] DECIMAL(5,2) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [branch_price_adjustments_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [branch_price_adjustments_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [branch_price_adjustments_branch_id_key] UNIQUE NONCLUSTERED ([branch_id])
);

-- CreateTable
CREATE TABLE [dbo].[orders] (
    [id] NVARCHAR(1000) NOT NULL,
    [order_no] NVARCHAR(1000) NOT NULL,
    [branch_id] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [orders_status_df] DEFAULT 'ONAY_BEKLIYOR',
    [delivery_date] DATE NOT NULL,
    [delivery_time] NVARCHAR(1000) NOT NULL,
    [note] NVARCHAR(1000),
    [total_tray] INT NOT NULL,
    [total_amount] DECIMAL(12,2) NOT NULL,
    [approved_by] NVARCHAR(1000),
    [approved_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [orders_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [orders_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [orders_order_no_key] UNIQUE NONCLUSTERED ([order_no])
);

-- CreateTable
CREATE TABLE [dbo].[order_items] (
    [id] NVARCHAR(1000) NOT NULL,
    [order_id] NVARCHAR(1000) NOT NULL,
    [product_id] NVARCHAR(1000) NOT NULL,
    [qty_tray] INT NOT NULL,
    [unit_price] DECIMAL(12,2) NOT NULL,
    CONSTRAINT [order_items_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[audit_logs] (
    [id] NVARCHAR(1000) NOT NULL,
    [actor_user_id] NVARCHAR(1000),
    [action] NVARCHAR(1000) NOT NULL,
    [entity] NVARCHAR(1000) NOT NULL,
    [entity_id] NVARCHAR(1000),
    [before_json] NVARCHAR(1000),
    [after_json] NVARCHAR(1000),
    [meta] NVARCHAR(1000),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [audit_logs_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [audit_logs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_users_branch_id] ON [dbo].[users]([branch_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_orders_branch_id] ON [dbo].[orders]([branch_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_orders_created_at] ON [dbo].[orders]([created_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_order_items_order_id] ON [dbo].[order_items]([order_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_order_items_product_id] ON [dbo].[order_items]([product_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_audit_logs_created_at] ON [dbo].[audit_logs]([created_at]);

-- AddForeignKey
ALTER TABLE [dbo].[users] ADD CONSTRAINT [users_branch_id_fkey] FOREIGN KEY ([branch_id]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[branch_price_adjustments] ADD CONSTRAINT [branch_price_adjustments_branch_id_fkey] FOREIGN KEY ([branch_id]) REFERENCES [dbo].[branches]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[orders] ADD CONSTRAINT [orders_branch_id_fkey] FOREIGN KEY ([branch_id]) REFERENCES [dbo].[branches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[orders] ADD CONSTRAINT [orders_approved_by_fkey] FOREIGN KEY ([approved_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[order_items] ADD CONSTRAINT [order_items_order_id_fkey] FOREIGN KEY ([order_id]) REFERENCES [dbo].[orders]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[order_items] ADD CONSTRAINT [order_items_product_id_fkey] FOREIGN KEY ([product_id]) REFERENCES [dbo].[products]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_actor_user_id_fkey] FOREIGN KEY ([actor_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
