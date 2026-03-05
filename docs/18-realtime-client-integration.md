# Integração de Client WebSocket (Socket.IO) no Desktop

Este documento aborda a integração do cliente Socket.IO em uma aplicação desktop (Electron/React) conectada a um Gateway NestJS, focando na sincronização em tempo real de estados entre as chamadas REST e as atualizações via WebSocket.

## 1. Recepção de Atualizações em Tempo Real

A integração de WebSockets no lado do cliente possibilita receber eventos do servidor instantaneamente sem métodos de *polling*.

- **Conexão:** Utilizamos a biblioteca `socket.io-client` para conectar ao nosso microserviço Gateway.
- **Autenticação:** Para garantir que a conexão WebSocket seja associada ao usuário ou administrador logado de forma segura, o token JWT (armazenado no lado do cliente, normalmente em *localStorage* ou *secure store*) é enviado via objeto de `auth` durante a conexão (`auth: { token }`).
- **Eventos:** O Gateway emite eventos como `notification:status_update`, `notification:delivered`, ou `notification:read`. O cliente "escuta" (listen) esses eventos usando `socket.on('nome-do-evento', callback)`.

### Exemplo de Configuração:
```tsx
const socket = io("http://localhost:3000", {
  auth: { token: localStorage.getItem("auth_token") },
  transports: ["websocket"] // Forçar websocket ao invés de long-polling garante menor latência
});
```

## 2. Padrões de Reconexão e Gerenciamento de Ciclo de Vida

Conexões WebSocket podem cair por n motivos: instabilidade na rede, interrupções no ciclo de vida do backend, etc.

- **Reconexão Automática:** O `socket.io-client` já cuida de reconexões automáticas por padrão (através de backoff exponencial).
- **Tratamento de Estado:** É importante escutar eventos de erro (como `connect_error`) e `disconnect` para informar o usuário amigavelmente de que a rede falhou.
- **Desconexão por falta de Autenticação:** Caso o Gateway rejeite a conexão porque o token espirou ou era inválido, recebemos um erro. Se isso acontecer, precisamos rotear o usuário para a página de login para que reinicie sua sessão.

## 3. Sincronização de Estado entre REST e WebSocket

Um padrão muito comum para dashboards é mesclar a interface REST com as notificações de WebSocket.

1. **Setup Inicial (REST):** Ao abrir a tela, o cliente usa `GET /notifications/history` para buscar o estado inicial (como paginação e o somatório atual de mensagens enviadas, entregues, lidas).
2. **Atualização Reativa (WebSocket):** Enquanto o usuário está com a tela aberta, ele está escutando eventos de socket.
3. **Padrão de Refetch vs In-Memory Mutation:**
   - *In-Memory Mutation:* Ideal para performance extrema. Ao receber um único evento `notification:read`, o cliente varre seu próprio estado em memória (`state.notifications`) local e incrementa `readCount++` da notificação que teve seu id alterado.
   - *Refetch:* É o padrão mais simples (e o que optamos por usar inicialmente nesta task): Ao receber qualquer evento de estado num Web Socket (`notification:status_update`), executamos a mesma chamada REST `fetchHistory(page)` que fazíamos anteriormente. Isso re-borda os dados do Backend sem corromper a paginação e evita complexidades de estado do lado do frontend (concorrências e merge conflict do frontend).

```tsx
socket.on("notification:delivered", () => {
    // Abordagem simples e resiliente de sincrozinação: dar reload nos dados!
    fetchHistory(currentPage);
});
```

Este pattern garante consistência total baseada no que o Backend possui de mais fresco no banco de dados. No futuro, pode evoluir para gerenciar os incrementos locais caso haja problemas de volumetria.
