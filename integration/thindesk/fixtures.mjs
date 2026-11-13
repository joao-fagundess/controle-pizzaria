// Chamados fictícios exclusivos do MongoDB de homologação, mantendo as limitações do modelo legado.
export const legacyTicketFixtures = [
  { _id: 'homologacao-001', descricao: 'Impressora do laboratório de homologação não imprime', status: 'ABERTO',
    tipo: 'Impressão', tecnico: 'Técnico de Homologação', usuario: 'Solicitante de Homologação' },
  { _id: 'homologacao-002', descricao: 'Conexão da estação de teste apresenta perda de pacotes', status: 'EM_ANDAMENTO',
    tipo: 'Rede', tecnico: 'Técnico de Homologação', usuario: 'Solicitante de Homologação' },
  { _id: 'homologacao-003', descricao: 'Restauração do arquivo de teste validada', status: 'CONCLUIDO',
    tipo: 'Backup', tecnico: 'Técnico de Homologação', usuario: 'Solicitante de Homologação' },
];
