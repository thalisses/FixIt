# Spec: Web Foundation

## Objetivo

Criar a aplicação web inicial do FixIt como parte de um monorepo. A equipe deve conseguir iniciá-la localmente por Docker Compose e abrir uma tela inicial no navegador.

### Critérios de aceite

- A aplicação React é servida em `http://localhost:5173`.
- A tela inicial identifica o produto como FixIt e não depende da API para renderizar.
- O build de produção termina sem erros de TypeScript.
- O escopo não inclui login, rotas de negócio, integração com a API ou funcionalidades do backlog.

## Stack

- React 18 e TypeScript 5, com verificação estrita de tipos.
- Vite 5 ou superior.
- Tailwind CSS 3, conforme a stack da especificação do sistema.
- Vitest como único framework/test runner de testes do frontend, com jsdom para fornecer o ambiente DOM; não usar Testing Library nesta etapa.

## Comandos

- Desenvolvimento integrado: `docker compose up --build`.
- Desenvolvimento isolado: `npm run dev --workspace @fixit/web`.
- Build: `npm run build --workspace @fixit/web`.
- Testes: `npm test --workspace @fixit/web`.
- Encerrar serviços: `docker compose down`.

## Estrutura do módulo

```text
apps/web/
  index.html
  src/
    App.tsx
    main.tsx
    styles/
      index.css
  package.json
  tsconfig.json
  vite.config.ts
```

## Estilo de código

Usar componentes funcionais, nomes de componentes em PascalCase e variáveis/funções em camelCase. Manter a apresentação inicial pequena e acessível.

```tsx
export function App() {
  return (
    <main>
      <h1>FixIt</h1>
    </main>
  );
}
```

## Estratégia de testes

- Vitest com jsdom para verificar que a tela inicial renderiza o nome FixIt, usando as APIs DOM diretamente.
- `npm run build --workspace @fixit/web` como verificação de compilação e tipos.
- A verificação de inicialização em conjunto com API e banco pertence à spec `local-stack`.

## Limites

- Sempre: manter o frontend independente da disponibilidade da API nesta etapa; manter tipos estritos e controles acessíveis.
- Perguntar antes: adicionar dependências além da stack definida, implementar navegação ou integrar chamadas HTTP.
- Nunca: adicionar credenciais ao código ou implementar funcionalidades do backlog como parte desta fundação.

## Critérios de sucesso

- `docker compose up --build` inicia o serviço web e a página abre em `http://localhost:5173`.
- `npm run build --workspace @fixit/web` termina com código de saída zero.
- O teste da tela inicial passa.

## Questões em aberto

- Nenhuma.