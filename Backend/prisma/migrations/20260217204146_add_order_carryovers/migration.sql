BEGIN TRY

BEGIN TRAN;

-- DropForeignKey
ALTER TABLE [dbo].[order_carryovers] DROP CONSTRAINT [order_carryovers_order_id_fkey];

-- AddForeignKey
ALTER TABLE [dbo].[order_carryovers] ADD CONSTRAINT [order_carryovers_order_id_fkey] FOREIGN KEY ([order_id]) REFERENCES [dbo].[orders]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
