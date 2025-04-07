const themeToggle = document.getElementById('themeToggle');
const body = document.body;

const currentTheme = localStorage.getItem('theme') || 'light';
body.classList.toggle('dark-mode', currentTheme === 'dark');
updateThemeIcon(currentTheme === 'dark');

themeToggle.addEventListener('click', () => {
    const isDark = body.classList.toggle('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
});

function updateThemeIcon(isDark) {
    themeToggle.innerHTML = isDark
        ? '<i class="fas fa-sun text-yellow-500"></i>'
        : '<i class="fas fa-moon text-gray-600"></i>';
}
const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('input', function (e) {
        const searchTerm = e.target.value.toLowerCase();

        document.querySelectorAll('.log-entry').forEach(entry => {
            const text = entry.textContent.toLowerCase();
            const isMatch = text.includes(searchTerm);
            entry.style.display = isMatch ? '' : 'none';
        });
    });
}

document.querySelectorAll('th[data-sort]').forEach(header => {
    header.addEventListener('click', () => {
        const tbody = document.querySelector('tbody');
        if (!tbody) return;

        const rows = Array.from(tbody.querySelectorAll('tr'));
        const sortKey = header.dataset.sort;
        const isAsc = header.classList.toggle('asc');

        rows.sort((a, b) => {
            const aVal = getSortValue(a, sortKey);
            const bVal = getSortValue(b, sortKey);
            return isAsc ? aVal - bVal : bVal - aVal;
        });

        rows.forEach(row => tbody.appendChild(row));
        updateSortIndicators(header);
    });
});

function getSortValue(row, key) {
    switch (key) {
        case 'size':
            return parseFloat(row.cells[1].textContent);
        case 'date':
            return new Date(row.cells[2].textContent).getTime();
        default:
            return row.cells[0].textContent.toLowerCase();
    }
}

function updateSortIndicators(sortedHeader) {
    document.querySelectorAll('th').forEach(header => {
        header.classList.remove('asc', 'desc');
        const indicator = header.querySelector('.sort-indicator');
        if (indicator) indicator.remove();
    });

    const icon = document.createElement('i');
    icon.className = `sort-indicator fas fa-arrow-${sortedHeader.classList.contains('asc') ? 'up' : 'down'
        } ml-2`;
    sortedHeader.appendChild(icon);
}

function animateLogEntries() {
    const entries = document.querySelectorAll('.log-entry');
    entries.forEach((entry, index) => {
        entry.style.animationDelay = `${index * 0.05}s`;
    });
}

document.addEventListener('DOMContentLoaded', animateLogEntries);

if (window.location.pathname.includes('/logs') && !window.location.pathname.includes('/view')) {
    try {
        const eventSource = new EventSource('/logs/stream');

        eventSource.onmessage = (e) => {
            try {
                const logs = JSON.parse(e.data);
                updateLogsList(logs);
            } catch (error) {
                console.error('Error parsing log data:', error);
            }
        };

        eventSource.onerror = () => {
            console.log('SSE connection closed or errored');
            setTimeout(() => {
                eventSource.close();
            }, 5000);
        };
    } catch (error) {
        console.error('Error setting up SSE:', error);
    }
}

function updateLogsList(logs) {
    const logContainer = document.querySelector('.log-list') || document.querySelector('.space-y-2');
    if (!logContainer || !logs || !logs.length) return;

    if (logContainer.tagName === 'TBODY') {
        logContainer.innerHTML = logs.map(file => `
      <tr class="log-entry">
        <td class="px-6 py-4 whitespace-nowrap">
          <i class="fas fa-file-code text-blue-500 mr-2"></i>
          ${file.name}
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          ${file.size.toFixed(2)} KB
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          ${new Date(file.modified).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        })}
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          <a href="/logs/view?file=${encodeURIComponent(file.path)}" 
             class="text-blue-500 hover:text-blue-700 mr-4">
            <i class="fas fa-eye"></i>
          </a>
          <a href="/logs/download?file=${encodeURIComponent(file.path)}" 
             class="text-green-500 hover:text-green-700">
            <i class="fas fa-download"></i>
          </a>
        </td>
      </tr>
    `).join('');
    }

    animateLogEntries();
}

function highlightJson() {
    const logContent = document.querySelector('#logContent pre');
    if (!logContent) return;

    const content = logContent.textContent;
    const highlighted = content.replace(/(\{.*?\})/g, match => {
        try {
            const json = JSON.parse(match);
            const levelClass = json.level === 'error' ? 'text-red-600' :
                json.level === 'warn' ? 'text-yellow-600' :
                    json.level === 'info' ? 'text-blue-600' : '';

            return `<span class="${levelClass}">${match}</span>`;
        } catch (e) {
            return match;
        }
    });

    if (highlighted !== content) {
        logContent.innerHTML = highlighted;
    }
}