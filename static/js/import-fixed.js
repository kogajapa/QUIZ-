// Funções para importação e exportação de perguntas em JSON

document.addEventListener('DOMContentLoaded', function() {
    // Referências aos elementos
    const btnImportQuestions = document.getElementById('btnImportQuestions');
    const btnExportQuestions = document.getElementById('btnExportQuestions');
    const fileImport = document.getElementById('fileImport');
    
    // Event listeners
    if (btnImportQuestions) {
        btnImportQuestions.addEventListener('click', function() {
            fileImport.click();
        });
    }
    
    if (btnExportQuestions) {
        btnExportQuestions.addEventListener('click', exportQuestions);
    }
    
    if (fileImport) {
        fileImport.addEventListener('change', handleFileSelect);
    }
    
    // Função para lidar com a seleção de arquivo
    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const jsonData = e.target.result;
                const importedQuestions = JSON.parse(jsonData);
                
                // Validar formato das perguntas
                if (!Array.isArray(importedQuestions)) {
                    throw new Error('O JSON deve ser um array de perguntas');
                }
                
                // Processar as perguntas importadas
                processImportedQuestions(importedQuestions);
            } catch (error) {
                showNotification('Erro ao importar: ' + error.message, 'error');
            }
        };
        reader.onerror = function() {
            showNotification('Erro ao ler o arquivo', 'error');
        };
        reader.readAsText(file);
        
        // Limpar o valor do input para permitir selecionar o mesmo arquivo novamente
        fileImport.value = '';
    }
    
    // Processar as perguntas importadas
    function processImportedQuestions(importedQuestions) {
        try {
            console.log('Perguntas recebidas:', JSON.stringify(importedQuestions));
            
            // Converter perguntas para o formato correto
            const convertedQuestions = importedQuestions.map(q => {
                // Criar uma cópia da pergunta para não modificar o original
                const question = { ...q };
                
                // Verificar se a pergunta tem os campos necessários
                if (!question.question) {
                    throw new Error('Pergunta sem texto');
                }
                
                // Verificar e converter options se necessário
                if (Array.isArray(question.options)) {
                    // Converter de array para objeto
                    question.options = {
                        'A': question.options[0],
                        'B': question.options[1],
                        'C': question.options[2],
                        'D': question.options[3]
                    };
                } else if (!question.options || typeof question.options !== 'object') {
                    throw new Error('Formato de opções inválido');
                }
                
                // Verificar e converter correct_answer para correct se necessário
                if (question.correct_answer !== undefined && question.correct === undefined) {
                    question.correct = question.correct_answer;
                    delete question.correct_answer;
                }
                
                // Verificar se correct é válido
                if (typeof question.correct !== 'number' || question.correct < 0 || question.correct > 3) {
                    throw new Error('Resposta correta inválida: ' + question.correct);
                }
                
                return question;
            });
            
            // Confirmar substituição ou adição
            const action = confirm('Deseja substituir todas as perguntas existentes? Clique em OK para substituir ou Cancelar para adicionar às perguntas existentes.');
            
            // Obter perguntas atuais
            fetch('/api/questions')
                .then(response => response.json())
                .then(currentQuestions => {
                    let newQuestions;
                    
                    if (action) {
                        // Substituir todas as perguntas
                        newQuestions = convertedQuestions;
                    } else {
                        // Adicionar às perguntas existentes
                        newQuestions = currentQuestions.concat(convertedQuestions);
                    }
                    
                    // Salvar no servidor
                    return fetch('/api/questions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(newQuestions)
                    });
                })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Erro HTTP: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    if (data.success) {
                        showNotification('Perguntas importadas com sucesso!', 'success');
                        // Recarregar perguntas
                        if (typeof window.loadQuestions === 'function') {
                            window.loadQuestions();
                        }
                    } else {
                        showNotification('Erro ao salvar perguntas: ' + (data.message || 'Erro desconhecido'), 'error');
                    }
                })
                .catch(error => {
                    showNotification('Erro ao salvar perguntas: ' + error.message, 'error');
                });
        } catch (error) {
            showNotification('Erro ao processar perguntas: ' + error.message, 'error');
        }
    }
    
    // Exportar perguntas para JSON
    function exportQuestions() {
        fetch('/api/questions')
            .then(response => response.json())
            .then(data => {
                // Criar blob e link para download
                const jsonStr = JSON.stringify(data, null, 2);
                const blob = new Blob([jsonStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.href = url;
                a.download = 'quiz-perguntas.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                showNotification('Perguntas exportadas com sucesso!', 'success');
            })
            .catch(error => {
                showNotification('Erro ao exportar perguntas: ' + error.message, 'error');
            });
    }
    
    // Função para mostrar notificação (usa a função global se disponível)
    function showNotification(message, type = 'info') {
        if (typeof window.showNotification === 'function') {
            window.showNotification(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
            alert(`${message}`);
        }
    }
});
