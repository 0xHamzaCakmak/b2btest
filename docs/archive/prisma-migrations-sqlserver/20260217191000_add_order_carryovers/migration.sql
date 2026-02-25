BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[order_carryovers] (
    [id] NVARCHAR(1000) NOT NULL,
    [order_id] NVARCHAR(1000) NOT NULL,
    [product_id] NVARCHAR(1000) NOT NULL,
    [qty_kg] DECIMAL(12,3) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [order_carryovers_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [order_carryovers_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [uq_order_carryovers_order_product] UNIQUE NONCLUSTERED ([order_id],[product_id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_order_carryovers_order_id] ON [dbo].[order_carryovers]([order_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_order_carryovers_product_id] ON [dbo].[order_carryovers]([product_id]);

-- AddForeignKey
ALTER TABLE [dbo].[order_carryovers] ADD CONSTRAINT [order_carryovers_order_id_fkey] FOREIGN KEY ([order_id]) REFERENCES [dbo].[orders]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[order_carryovers] ADD CONSTRAINT [order_carryovers_product_id_fkey] FOREIGN KEY ([product_id]) REFERENCES [dbo].[products]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
