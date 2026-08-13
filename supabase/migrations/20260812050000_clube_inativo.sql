-- Excluir clube direto quebrava com erro de chave estrangeira assim que ele
-- já tinha algum acerto calculado (acertos.club_id -> clubs.id não tem
-- cascade, de propósito — apagar o clube não pode apagar o histórico
-- financeiro junto). Em vez de excluir de verdade, "excluir" um clube agora
-- só marca ativo = false: some da lista, mas o cadastro e todo o histórico
-- (acertos, stoploss, lançamentos) continuam intactos e reversível.
alter table clubs add column if not exists ativo boolean not null default true;
