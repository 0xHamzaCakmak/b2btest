BEGIN TRY

BEGIN TRAN;

-- DropIndex
DROP INDEX [idx_orders_delivered_by] ON [dbo].[orders];

-- AlterTable
ALTER TABLE [dbo].[orders] DROP CONSTRAINT [orders_delivery_status_df];
ALTER TABLE [dbo].[orders] ADD CONSTRAINT [orders_delivery_status_df] DEFAULT 'TESLIM_BEKLIYOR' FOR [delivery_status];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
