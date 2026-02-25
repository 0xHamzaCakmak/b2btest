BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[order_items]
ADD [approved_qty_tray] INT;

-- Backfill existing finalized orders
EXEC sp_executesql N'
UPDATE oi
SET oi.[approved_qty_tray] = oi.[qty_tray]
FROM [dbo].[order_items] oi
INNER JOIN [dbo].[orders] o ON o.[id] = oi.[order_id]
WHERE UPPER(o.[status]) = ''ONAYLANDI'';

UPDATE oi
SET oi.[approved_qty_tray] = 0
FROM [dbo].[order_items] oi
INNER JOIN [dbo].[orders] o ON o.[id] = oi.[order_id]
WHERE UPPER(o.[status]) = ''ONAYLANMADI'';
';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
