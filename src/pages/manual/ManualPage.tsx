import type { ReactNode } from 'react'
import { HardHat } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ManualCover, ManualIntro, Chapter, Step, Tip, StepNote, ManualTable } from './parts'
import packageJson from '../../../package.json'

/** Versão do app lida do package.json. */
const APP_VERSION: string = packageJson.version ?? '—'

/**
 * Página "Manual do Sistema": documento de treinamento completo em português,
 * com botão "Baixar PDF" (window.print) e CSS @media print para impressão limpa
 * (sem sidebar, sem header, cada capítulo iniciando em nova página).
 */
export default function ManualPage() {
  const generatedAt = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  return (
    <div className="manual-root mx-auto max-w-4xl space-y-8">
      {/* Cabeçalho com botão de impressão (some no @media print) */}
      <div className="manual-header flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Manual do Sistema — Gestão de Obras</h1>
          <p className="text-muted-foreground mt-1">
            Guia completo de treinamento para administradores de obra, gestores e prestadores.
          </p>
        </div>
        <div className="manual-actions shrink-0">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
          >
            Baixar PDF
          </button>
        </div>
      </div>

      {/* Capa do manual (aparece na impressão) */}
      <ManualCover version={APP_VERSION} generatedAt={generatedAt} />

      <ManualIntro />

      <Chapter
        number={1}
        title="Acessar o sistema"
        goal="Entrar no sistema, recuperar o acesso se esquecer a senha e instalar o aplicativo no celular."
      >
        <Step n={1}>
          Abra o navegador e digite o endereço do sistema (o mesmo link que a empresa costuma
          compartilhar por WhatsApp ou e-mail). A tela de entrada mostra o nome{' '}
          <strong>Gestão de Obras SaaS</strong> no centro da tela.
        </Step>
        <Step n={2}>
          Digite o seu <strong>e-mail corporativo</strong> no primeiro campo e a sua{' '}
          <strong>senha</strong> no segundo campo.
        </Step>
        <Step n={3}>
          Toque no botão <strong>“Acessar Sistema”</strong>. Se os dados estiverem corretos, você
          entra direto no painel inicial.
        </Step>
        <Tip kind="warn">
          Se aparecer <em>“Email ou senha incorretos”</em>, confira se não há espaço extra no final
          do e-mail e se a tecla de maiúsculas (Shift) não está ativada por engano. Se ainda assim
          não entrar, fale com o administrador do sistema da sua empresa.
        </Tip>
        <Step n={4}>
          <strong>Esqueceu a senha?</strong> Clique no link <em>“Esqueceu a senha?”</em> ao lado do
          campo de senha e siga as instruções que aparecerem na tela. Em todos os casos, o caminho
          mais rápido é <strong>falar com o administrador</strong> do sistema: ele redefine o acesso
          para você.
        </Step>
        <Step n={5}>
          <strong>Instalar no celular:</strong> após entrar, procure no topo da tela (ou no menu
          lateral) o botão <strong>“Instalar App”</strong>. Ao confirmar, o sistema vira um ícone na
          tela inicial do celular, como se fosse um aplicativo comum, com carregamento mais rápido e
          acesso offline às telas já visitadas.
        </Step>
        <StepNote>
          O sistema também funciona direto no navegador do celular, sem instalar nada. Instalar o
          aplicativo apenas deixa o acesso mais prático para o dia a dia na obra.
        </StepNote>
      </Chapter>

      <Chapter
        number={2}
        title="Visão geral (Dashboard e Planner)"
        goal="Entender o que aparece no painel inicial e usar a busca do topo para encontrar obras e materiais."
      >
        <Step n={1}>
          Ao entrar, você vê o <strong>Dashboard</strong> (tela inicial): cartões com o total de
          obras, obras em andamento, obras atrasadas e o resumo financeiro (receitas, despesas e
          saldo), além de gráficos de acompanhamento.
        </Step>
        <Step n={2}>
          <strong>Busca global:</strong> no topo da tela existe o campo{' '}
          <em>“Buscar obras, materiais...”</em>. Digite parte do nome de uma obra ou de um material
          para localizá-los sem precisar abrir cada menu.
        </Step>
        <Step n={3}>
          No menu lateral, abra <strong>Planner</strong> para ver o quadro de tarefas: as colunas{' '}
          <strong>Pendente</strong>, <strong>Em Andamento</strong> e <strong>Concluída</strong>{' '}
          mostram o andamento de cada atividade.
        </Step>
        <Step n={4}>
          Para criar uma tarefa, clique em <strong>“Nova Tarefa”</strong>, preencha o título (por
          exemplo, <em>“Instalar esquadrias do 2º andar”</em>), a descrição, o responsável, a obra
          relacionada e a data. Depois, arraste a tarefa de coluna em coluna conforme ela avança.
        </Step>
        <Tip>
          Cada tarefa também tem <strong>prioridade</strong> (Baixa, Média, Alta) e aceita{' '}
          <strong>anexos</strong>, como fotos e arquivos do celular. Use isso para registrar o que
          foi combinado na obra.
        </Tip>
      </Chapter>

      <Chapter
        number={3}
        title="Obras e Diário de Obra"
        goal="Criar e editar obras, acompanhar o status e registrar o dia a dia da obra com fotos."
      >
        <h3 className="text-lg font-semibold text-foreground">3.1 — Criar uma obra</h3>
        <Step n={1}>
          No menu lateral, clique em <strong>Obras</strong> e depois no botão{' '}
          <strong>“Nova Obra”</strong>.
        </Step>
        <Step n={2}>
          Preencha os campos principais: <strong>Nome da Obra</strong> (obrigatório),{' '}
          <strong>Cliente / Proprietário</strong>, <strong>Gerente / Responsável</strong>,{' '}
          <strong>Endereço</strong>, <strong>Data de Início</strong>,{' '}
          <strong>Previsão de Término</strong>, <strong>Área Total (m²)</strong>,{' '}
          <strong>Orçamento Planejado</strong> e <strong>Valor Contratado</strong>.
        </Step>
        <Step n={3}>
          Clique em <strong>Salvar</strong>. A obra aparece na lista com o status{' '}
          <strong>“Planejada”</strong>.
        </Step>
        <Tip>
          Começando agora? O botão <strong>“criar obra de exemplo”</strong> na tela de Obras cria
          uma obra completa (com despesas, receitas e etapas) para você treinar sem medo de errar.
        </Tip>
        <h3 className="text-lg font-semibold text-foreground pt-2">3.2 — Editar e acompanhar</h3>
        <Step n={1}>
          Clique no nome da obra para abri-la. No topo ficam o nome, o cliente e o{' '}
          <strong>status</strong> atual: <em>Planejada</em>, <em>Em Andamento</em>, <em>Pausada</em>
          , <em>Atrasada</em> ou <em>Finalizada</em>.
        </Step>
        <Step n={2}>
          Para mudar dados como nome, cliente, datas, área ou orçamento, clique em{' '}
          <strong>Editar</strong>, ajuste os campos e salve.
        </Step>
        <Step n={3}>
          Dentro da obra, use as abas: <strong>Visão Geral</strong> (resumo financeiro e indicadores
          como ROI e ponto de equilíbrio), <strong>Etapas do Projeto</strong>,{' '}
          <strong>Serviços</strong>, <strong>Materiais Alocados</strong>, <strong>Receitas</strong>{' '}
          e <strong>Cronograma</strong>.
        </Step>
        <h3 className="text-lg font-semibold text-foreground pt-2">3.3 — Diário de obras</h3>
        <Step n={1}>
          Abra a obra e vá na aba <strong>Notas</strong> — ou abra o menu{' '}
          <strong>Diário de Obra</strong> no menu lateral para ver todos os registros de todas as
          obras.
        </Step>
        <Step n={2}>
          Clique em <strong>“Novo Diário de Obra”</strong> (ou preencha o formulário da aba Notas):
          escolha a <strong>obra</strong>, a <strong>data</strong>, informe o número de{' '}
          <strong>trabalhadores</strong> presentes e o <strong>clima</strong> do dia.
        </Step>
        <Step n={3}>
          Escreva em <strong>“Atividades e Ocorrências”</strong> o que aconteceu no dia
          (concretação, entrega de material, chuva, visita do cliente...). Anexe{' '}
          <strong>fotos</strong> para documentar — elas ficam salvas junto do registro.
        </Step>
        <Step n={4}>
          Salve o registro. Cada diário aparece como um cartão com data, obra, clima, efetivo,
          ocorrências e galeria de fotos.
        </Step>
        <Tip>
          O diário é a memória da obra. Registrar todo dia — mesmo que seja pouco — evita discussões
          futuras sobre “quem fez o quê” e “quando começou”.
        </Tip>
      </Chapter>

      <Chapter
        number={4}
        title="Materiais e estoque"
        goal="Cadastrar materiais e acompanhar o estoque e o consumo por obra."
      >
        <Step n={1}>
          No menu lateral, clique em <strong>Materiais</strong>. Para cadastrar, use o botão de novo
          material: informe <strong>nome</strong>, <strong>categoria</strong>,{' '}
          <strong>unidade nativa</strong> (kg, m³, un...), <strong>quantidade em estoque</strong>,{' '}
          <strong>quantidade mínima</strong>, <strong>fornecedor</strong> e{' '}
          <strong>preço unitário</strong>.
        </Step>
        <Step n={2}>
          Use a aba <strong>“Catálogo Geral”</strong> para os materiais padrão da empresa e{' '}
          <strong>“Específicos de Obra”</strong> para os que pertencem a uma obra só.
        </Step>
        <Step n={3}>
          <strong>Entradas e saídas:</strong> todo consumo registrado dentro de uma obra (aba{' '}
          <strong>Materiais Alocados</strong> → botão <strong>“Lançar Consumo”</strong>) baixa
          automaticamente o estoque do material — funciona como a saída do almoxarifado. Quando um
          material fica abaixo da <strong>quantidade mínima</strong>, o sistema marca como{' '}
          <em>“Estoque insuficiente”</em>.
        </Step>
        <Step n={4}>
          <strong>Consultar estoque por obra:</strong> abra a obra desejada e clique na aba{' '}
          <strong>Materiais Alocados</strong>. Ali aparecem os materiais previstos, a quantidade
          calculada pela área da obra (com conversão de unidades) e o consumo real lançado.
        </Step>
        <Tip>
          O cálculo de consumo usa a <strong>área total (m²)</strong> informada na obra. Mantenha
          esse campo atualizado para que as previsões de material fiquem corretas.
        </Tip>
      </Chapter>

      <Chapter
        number={5}
        title="Financeiro (receitas, despesas e contratos)"
        goal="Registrar o dinheiro que entra e sai, vincular à obra certa e acompanhar os resumos."
      >
        <h3 className="text-lg font-semibold text-foreground">5.1 — Despesas</h3>
        <Step n={1}>
          No menu <strong>Despesas</strong>, clique em <strong>“Nova Despesa”</strong> e preencha:{' '}
          <strong>obra</strong> (para vínculo), <strong>descrição</strong>,{' '}
          <strong>categoria</strong> (Materiais, Mão de obra, Serviços...), <strong>valor</strong>,{' '}
          <strong>data</strong>, loja/mercado, CNPJ e forma de pagamento.
        </Step>
        <Step n={2}>
          <strong>Escanear Nota:</strong> em vez de digitar tudo, tire uma foto da nota fiscal (ou
          cole o link da NFCe) e o sistema lê os dados sozinho e preenche a despesa. Confira sempre
          os valores antes de salvar.
        </Step>
        <h3 className="text-lg font-semibold text-foreground pt-2">5.2 — Receitas</h3>
        <Step n={1}>
          As receitas são registradas dentro da obra: abra a obra → aba <strong>Receitas</strong> →
          botão <strong>“Registrar Receita”</strong> → informe descrição, valor e data.
        </Step>
        <Step n={2}>
          Na aba <strong>Visão Geral</strong> da obra (e na tela Dashboard) você vê o resumo:{' '}
          <strong>orçamento planejado</strong>, <strong>receitas</strong>, <strong>despesas</strong>
          , <strong>saldo</strong>, <strong>ROI da Obra</strong>,{' '}
          <strong>Ponto de Equilíbrio</strong> e <strong>Prazo de Retorno (Payback)</strong>.
        </Step>
        <h3 className="text-lg font-semibold text-foreground pt-2">
          5.3 — Contratos externos (Serviços Contratados)
        </h3>
        <Step n={1}>
          No menu <strong>Equipes</strong>, vá na aba <strong>Serviços Contratados</strong> e clique
          em <strong>“Adicionar Serviço Contratado”</strong>.
        </Step>
        <Step n={2}>
          Preencha: <strong>prestador de serviço</strong>, <strong>descrição do serviço</strong>,{' '}
          <strong>unidade</strong>, <strong>valor total</strong>,{' '}
          <strong>quantidade executada</strong>, <strong>data meta / prazo</strong>,{' '}
          <strong>status</strong> e <strong>notas de pagamentos</strong>. Cada contrato fica salvo e
          aparece na lista com o total já executado.
        </Step>
        <Tip kind="warn">
          Sempre vincule a despesa à obra certa. É esse vínculo que permite ver, obra por obra,
          quanto entrou, quanto saiu e qual o lucro real.
        </Tip>
      </Chapter>

      <Chapter
        number={6}
        title="Equipes e Mão de Obra"
        goal="Cadastrar funcionários, organizar grupos, controlar diárias, prestadores e contratos."
      >
        <Step n={1}>
          No menu <strong>Equipes</strong> você encontra cinco abas:{' '}
          <strong>Controle de Diárias</strong>, <strong>Funcionários</strong>,{' '}
          <strong>Grupos</strong>, <strong>Prestadores</strong> e{' '}
          <strong>Serviços Contratados</strong>.
        </Step>
        <h3 className="text-lg font-semibold text-foreground">6.1 — Aba Funcionários</h3>
        <Step n={2}>
          Clique em <strong>“Adicionar Funcionário”</strong> e preencha: nome completo, função (ex.:
          Pedreiro, Eletricista), telefone, chave PIX, data de admissão, grupo/frente de trabalho
          (ex.: <em>Alvenaria, Elétrica, Hidráulica, Pintura e Acabamento</em>), tipo de pagamento
          (diária, por serviço ou mensal), valor e status (Ativo/Inativo).
        </Step>
        <h3 className="text-lg font-semibold text-foreground">6.2 — Aba Grupos</h3>
        <Step n={3}>
          Em <strong>Grupos</strong>, crie as frentes de trabalho com o botão de novo grupo: informe
          o <strong>nome</strong> (ex.: Alvenaria) e uma descrição opcional. Renomeie a qualquer
          momento pela opção de editar.
        </Step>
        <Tip kind="warn">
          Excluir um grupo <strong>não apaga os funcionários</strong>. Eles continuam cadastrados;
          apenas ficam “sem grupo” até você escolher outro.
        </Tip>
        <h3 className="text-lg font-semibold text-foreground">6.3 — Aba Controle de Diárias</h3>
        <Step n={4}>
          Escolha o dia (setas ou campo de data) e marque a <strong>presença</strong> de cada
          funcionário. A tabela soma <strong>dias trabalhados na semana</strong>, mostra o{' '}
          <strong>valor da diária</strong>, permite lançar <strong>extras semanais</strong> (horas
          extras, ajuda de custo) e calcula o <strong>total a receber</strong> por pessoa.
        </Step>
        <h3 className="text-lg font-semibold text-foreground">6.4 — Aba Prestadores</h3>
        <Step n={5}>
          Cadastre empresas e profissionais parceiros: nome/empresa, tipo de serviço (Elétrica,
          Hidráulica, Pintura...), contato, responsável, e-mail, nível da equipe, qualidade, prazo e
          observações. É uma agenda de fornecedores de mão de obra.
        </Step>
        <h3 className="text-lg font-semibold text-foreground">6.5 — Aba Serviços Contratados</h3>
        <Step n={6}>
          Aqui ficam os <strong>contratos externos</strong> descritos no capítulo 5: serviços de
          terceiros com valor total, quantidade executada e pagamentos.
        </Step>
      </Chapter>

      <Chapter
        number={7}
        title="Relatórios"
        goal="Gerar e exportar resumos de custos, orçamentos e evolução das obras."
      >
        <Step n={1}>
          No menu <strong>Relatórios</strong> há dois relatórios prontos:{' '}
          <strong>“Resumo Financeiro por Obra”</strong> (orçamentos, custos realizados e saldo
          disponível) e <strong>“Evolução Física Global”</strong> (histórico de medições e avanço de
          cronograma).
        </Step>
        <Step n={2}>
          Clique em <strong>“Exportar CSV”</strong> ou <strong>“Exportar PDF”</strong> no cartão do
          relatório. O arquivo é gerado e baixado no seu dispositivo.
        </Step>
        <Step n={3}>
          Além disso, <strong>este Manual</strong> pode virar PDF a qualquer momento pelo botão{' '}
          <strong>“Baixar PDF”</strong> no topo desta página — use a mesma opção de{' '}
          <em>“Salvar como PDF”</em> da janela de impressão.
        </Step>
        <Tip>
          Para relatórios por obra específica (custo por etapa, consumo de material, receitas), abra
          a obra e navegue pelas abas <strong>Visão Geral</strong> e{' '}
          <strong>Materiais Alocados</strong>.
        </Tip>
      </Chapter>

      <Chapter
        number={8}
        title="Configurações (usuários, permissões e catálogo)"
        goal="Gerenciar quem acessa o sistema, o nível de cada usuário e o catálogo de serviços."
      >
        <h3 className="text-lg font-semibold text-foreground">8.1 — Aba Usuários e Permissões</h3>
        <Step n={1}>
          No menu <strong>Configurações</strong>, a aba <strong>Usuários e Permissões</strong> lista{' '}
          <strong>todos os usuários criados</strong>, com nome, e-mail e o papel atual de cada um.
        </Step>
        <Step n={2}>
          A coluna <strong>“Último login”</strong> mostra a <strong>data e hora exata</strong> do
          último acesso de cada usuário, no formato <em>dia/mês/ano hora:minuto</em> (ex.:{' '}
          <em>05/11/2026 08:43</em>). Quem nunca fez login aparece como{' '}
          <strong>“Nunca entrou”</strong>.
        </Step>
        <Step n={3}>
          Para <strong>alterar o nível de acesso</strong>, use o seletor da coluna{' '}
          <strong>“Alterar Nível de Acesso”</strong> e escolha entre <strong>Admin</strong>,{' '}
          <strong>Gestor</strong> ou <strong>Prestador</strong>. A mudança vale a partir do próximo
          carregamento do sistema para aquele usuário.
        </Step>
        <Tip kind="warn">
          O papel <strong>Admin</strong> dá acesso total — inclusive a alterar permissões de outras
          pessoas. Conceda com cuidado.
        </Tip>
        <h3 className="text-lg font-semibold text-foreground">8.2 — Aba Catálogo de Serviços</h3>
        <Step n={4}>
          Clique em <strong>“Novo Serviço”</strong>, informe o <strong>nome</strong> do serviço e a{' '}
          <strong>unidade de medida</strong> (m², m³, un...). Para cada serviço, o botão{' '}
          <strong>“Composições”</strong> permite detalhar os insumos que o compõem (material e
          quantidade por unidade).
        </Step>
        <Step n={5}>
          Esse catálogo alimenta a aba <strong>Serviços</strong> das obras, permitindo montar{' '}
          <strong>orçamentos e medições</strong> com base em serviços e composições padronizados.
        </Step>
      </Chapter>

      <Chapter
        number={9}
        title="Papéis e permissões (resumo)"
        goal="Ver de forma rápida o que cada tipo de usuário pode acessar."
      >
        <ManualTable
          headers={['Papel', 'O que pode acessar']}
          rows={[
            [
              'Admin',
              'Acesso total a todos os módulos: financeiro, configurações, equipes e usuários. É o único que gerencia usuários e permissões.',
            ],
            [
              'Gestor',
              'Acesso a todas as áreas operacionais e financeiras: obras, planner, materiais, diário, equipes, despesas, relatórios e catálogo de serviços.',
            ],
            [
              'Prestador',
              'Acesso somente a Planner, Obras, Materiais e Diário de Obras. As demais áreas (financeiro, equipes, configurações) ficam bloqueadas.',
            ],
          ]}
        />
        <div className="manual-avoid-break flex flex-wrap gap-2 pt-2">
          <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100 border border-purple-200">
            Admin
          </Badge>
          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 border border-blue-200">
            Gestor
          </Badge>
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border border-amber-200">
            Prestador
          </Badge>
        </div>
        <Tip>
          Na dúvida sobre o seu nível de acesso, peça ao administrador para conferir em{' '}
          <strong>Configurações → Usuários e Permissões</strong>.
        </Tip>
      </Chapter>

      <Card className="manual-footer border-primary/20 bg-primary/5">
        <CardContent className="pt-6 space-y-1 text-sm">
          <p className="flex items-center gap-2 font-semibold text-foreground">
            <HardHat className="h-4 w-4 text-primary" /> Gestão de Obras SaaS
          </p>
          <p className="text-muted-foreground">
            Versão do app: {APP_VERSION} · Manual gerado em {generatedAt}.
          </p>
          <p className="text-muted-foreground">
            Dúvidas ou sugestões? Fale com o administrador do sistema da sua empresa.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
