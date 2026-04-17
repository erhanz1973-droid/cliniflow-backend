// Manual activate button for zlatan clinic
// Run this in browser console on super admin page

// Find zlatan row and add activate button
const rows = document.querySelectorAll('tbody tr');
rows.forEach(row => {
  const cells = row.querySelectorAll('td');
  if (cells.length > 0) {
    const nameCell = cells[1]; // Name column
    if (nameCell.textContent.includes('zlatan')) {
      const actionsCell = cells[cells.length - 1]; // Actions column
      const activateBtn = document.createElement('button');
      activateBtn.className = 'success';
      activateBtn.textContent = '✅ Aktifleştir';
      activateBtn.onclick = () => activateClinic('0c4358c9-e102-4b76-b649-f595319d9d23');
      activateBtn.style.marginRight = '8px';
      actionsCell.innerHTML = '';
      actionsCell.appendChild(activateBtn);
      console.log('✅ Aktifleştir butonu eklendi!');
    }
  }
});
