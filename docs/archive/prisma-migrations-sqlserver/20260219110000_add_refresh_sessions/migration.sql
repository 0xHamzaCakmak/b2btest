BEGIN TRY

BEGIN TRAN;

CREATE TABLE [dbo].[refresh_sessions] (
  [id] NVARCHAR(1000) NOT NULL,
  [jti] NVARCHAR(1000) NOT NULL,
  [user_id] NVARCHAR(1000) NOT NULL,
  [expires_at] DATETIME2 NOT NULL,
  [revoked_at] DATETIME2,
  [replaced_by_jti] NVARCHAR(1000),
  [ip_address] NVARCHAR(1000),
  [user_agent] NVARCHAR(1000),
  [created_at] DATETIME2 NOT NULL CONSTRAINT [refresh_sessions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT [refresh_sessions_pkey] PRIMARY KEY CLUSTERED ([id]),
  CONSTRAINT [refresh_sessions_jti_key] UNIQUE NONCLUSTERED ([jti]),
  CONSTRAINT [refresh_sessions_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE NONCLUSTERED INDEX [idx_refresh_sessions_user_id] ON [dbo].[refresh_sessions]([user_id]);
CREATE NONCLUSTERED INDEX [idx_refresh_sessions_expires_at] ON [dbo].[refresh_sessions]([expires_at]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
