-- Função de "esqueci minha senha" sem envio de email: dado um email e uma
-- senha nova, atualiza a senha do usuário na hora, sem etapa de confirmação.
-- Decisão consciente do produto (sem infra de email configurada ainda): não
-- garante que quem está pedindo a troca é o dono da conta — só quem já sabe
-- o email dela. Retorna boolean pra o front nunca revelar se aquele email
-- tem conta ou não.
create or replace function public.redefinir_senha_direta(p_email text, p_nova_senha text)
returns boolean
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid;
begin
  if p_nova_senha is null or length(p_nova_senha) < 6 then
    raise exception 'senha muito curta';
  end if;

  select id into v_user_id from auth.users where email = lower(p_email) limit 1;

  if v_user_id is null then
    return false;
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_nova_senha, extensions.gen_salt('bf')),
      updated_at = now()
  where id = v_user_id;

  return true;
end;
$$;

revoke all on function public.redefinir_senha_direta(text, text) from public;
grant execute on function public.redefinir_senha_direta(text, text) to anon, authenticated;
