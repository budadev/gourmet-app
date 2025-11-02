/* =============================
   Item Type Editor Component
   ============================= */

import { el, escapeHtml } from '../utils.js';
import {
  updateItemTypeData,
  deleteItemTypeData,
  createItemType,
  getAllItemTypes,
  generateKey
} from '../models/itemTypes.js';
import { reloadConfig } from '../config.js';

let currentEditingKey = null;

/**
 * Open the item type editor for an existing type
 */
export async function openItemTypeEditor(itemElement, typeKey) {
  const modal = el('itemTypesEditorModal');
  if (!modal) return;

  currentEditingKey = typeKey;

  const { getItemTypeByKey } = await import('../models/itemTypes.js');
  const itemType = await getItemTypeByKey(typeKey);

  if (!itemType) {
    console.error('Item type not found:', typeKey);
    return;
  }

  // Populate the editor
  el('itemTypeEditorTitle').textContent = 'Edit Item Type';
  el('itemTypeLabelInput').value = itemType.label || '';
  el('itemTypeIconInput').value = itemType.icon || '';


  // Render fields
  renderFieldsEditor(itemType.fields || []);

  // Show delete button for existing types
  const deleteBtn = el('deleteItemTypeBtn');
  if (deleteBtn) deleteBtn.style.display = 'block';

  // Show the modal
  modal.classList.add('active');
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  // Position near the clicked element if possible
  if (itemElement) {
    const rect = itemElement.getBoundingClientRect();
    const modalContent = modal.querySelector('.item-type-editor-content');
    if (modalContent && rect.top < window.innerHeight / 2) {
      modalContent.style.marginTop = `${rect.bottom + 10}px`;
    }
  }
}

/**
 * Open the item type editor for creating a new type
 */
export function openCreateItemTypeEditor() {
  const modal = el('itemTypesEditorModal');
  if (!modal) return;

  currentEditingKey = null;

  // Clear the form
  el('itemTypeEditorTitle').textContent = 'Create Item Type';
  el('itemTypeLabelInput').value = '';
  el('itemTypeIconInput').value = '';


  // Render empty fields editor
  renderFieldsEditor([]);

  // Hide delete button for new types
  const deleteBtn = el('deleteItemTypeBtn');
  if (deleteBtn) deleteBtn.style.display = 'none';

  // Show the modal
  modal.classList.add('active');
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
}

/**
 * Close the item type editor
 */
export function closeItemTypeEditor() {
  const modal = el('itemTypesEditorModal');
  if (!modal) return;

  modal.classList.remove('active');
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
  currentEditingKey = null;
}

/**
 * Render the fields editor section
 */
function renderFieldsEditor(fields) {
  const container = el('itemTypeFieldsList');
  if (!container) return;

  container.innerHTML = '';

  fields.forEach((field, index) => {
    const fieldDiv = createFieldRow(field, index);
    container.appendChild(fieldDiv);
  });

  // Add empty row for adding new field
  const addButton = document.createElement('button');
  addButton.className = 'btn secondary btn-sm';
  addButton.type = 'button';
  addButton.textContent = '+ Add Field';
  addButton.style.marginTop = '12px';
  addButton.addEventListener('click', () => {
    const newField = { name: '', label: '', type: 'string', options: [] };
    const newFieldRow = createFieldRow(newField, fields.length);
    container.insertBefore(newFieldRow, addButton);
  });
  container.appendChild(addButton);
}

/**
 * Create a single field row for editing
 */
function createFieldRow(field, index) {
  const fieldDiv = document.createElement('div');
  fieldDiv.className = 'item-type-field-row';
  fieldDiv.setAttribute('data-index', index);

  // Line 1: Label input (name will be auto-generated)
  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.placeholder = 'Field name (e.g., Color, Vintage, Producer)';
  labelInput.value = field.label || '';
  labelInput.className = 'field-label-input';

  // Line 2: Type selector
  const typeSelect = document.createElement('select');
  typeSelect.className = 'field-type-select';
  typeSelect.innerHTML = `
    <option value="string" ${field.type === 'string' ? 'selected' : ''}>Text</option>
    <option value="number" ${field.type === 'number' ? 'selected' : ''}>Number</option>
    <option value="enum" ${field.type === 'enum' ? 'selected' : ''}>Dropdown</option>
  `;

  // Line 3: Options input (only visible for enum)
  const optionsContainer = document.createElement('div');
  optionsContainer.className = 'field-options-container';
  optionsContainer.style.display = field.type === 'enum' ? 'block' : 'none';

  const optionsInput = document.createElement('input');
  optionsInput.type = 'text';
  optionsInput.placeholder = 'Options (comma-separated, e.g., Red, White, Rosé)';
  optionsInput.value = field.options ? field.options.join(', ') : '';
  optionsInput.className = 'field-options-input';
  optionsContainer.appendChild(optionsInput);

  typeSelect.addEventListener('change', () => {
    optionsContainer.style.display = typeSelect.value === 'enum' ? 'block' : 'none';
  });

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn danger btn-sm field-delete-btn';
  deleteBtn.type = 'button';
  deleteBtn.textContent = '×';
  deleteBtn.title = 'Remove field';
  deleteBtn.addEventListener('click', () => {
    fieldDiv.remove();
  });

  // Assemble the row
  const header = document.createElement('div');
  header.className = 'field-row-header';
  header.appendChild(labelInput);
  header.appendChild(deleteBtn);

  fieldDiv.appendChild(header);
  fieldDiv.appendChild(typeSelect);
  fieldDiv.appendChild(optionsContainer);

  return fieldDiv;
}

/**
 * Save the item type
 */
export async function saveItemType() {
  const label = el('itemTypeLabelInput').value.trim();
  const icon = el('itemTypeIconInput').value.trim();

  if (!label) {
    alert('Please provide a label for the item type.');
    return;
  }

  // Collect fields
  const fieldsContainer = el('itemTypeFieldsList');
  const fieldRows = fieldsContainer.querySelectorAll('.item-type-field-row');
  const fields = [];

  fieldRows.forEach(row => {
    const labelInput = row.querySelector('.field-label-input');
    const typeSelect = row.querySelector('.field-type-select');
    const optionsInput = row.querySelector('.field-options-input');

    const fieldLabel = labelInput ? labelInput.value.trim() : '';
    const type = typeSelect ? typeSelect.value : 'string';

    if (fieldLabel) {
      // Auto-generate field name from label
      const fieldName = generateKey(fieldLabel);

      const field = { name: fieldName, label: fieldLabel, type };

      if (type === 'enum' && optionsInput) {
        const optionsStr = optionsInput.value.trim();
        field.options = optionsStr ? optionsStr.split(',').map(o => o.trim()).filter(o => o) : [];
      }

      fields.push(field);
    }
  });

  try {
    if (currentEditingKey) {
      // Update existing
      await updateItemTypeData(currentEditingKey, { label, icon, fields });
    } else {
      // Create new - generate key from label
      const key = generateKey(label);

      // Check if key already exists
      const allTypes = await getAllItemTypes();
      if (allTypes[key]) {
        alert(`An item type with this name already exists (generated key: "${key}"). Please use a different name.`);
        return;
      }

      // Get max rank and add 1
      const ranks = Object.values(allTypes).map(t => t.rank || 0);
      const maxRank = ranks.length > 0 ? Math.max(...ranks) : 0;

      await createItemType(key, label, icon, fields);
      // Update rank to be at the end
      const { updateItemType } = await import('../db.js');
      await updateItemType(key, { rank: maxRank + 1 });
    }

    // Reload config to update the app
    await reloadConfig();

    closeItemTypeEditor();
  } catch (e) {
    console.error('Failed to save item type:', e);
    alert('Failed to save item type: ' + e.message);
  }
}

/**
 * Delete the current item type
 */
export async function deleteItemType() {
  if (!currentEditingKey) return;

  if (!confirm(`Are you sure you want to delete the "${currentEditingKey}" item type? This action cannot be undone.`)) {
    return;
  }

  try {
    await deleteItemTypeData(currentEditingKey);
    await reloadConfig();
    closeItemTypeEditor();
  } catch (e) {
    console.error('Failed to delete item type:', e);
    alert('Failed to delete item type: ' + e.message);
  }
}

/**
 * Initialize the item type editor event listeners
 */
export function initItemTypeEditor() {
  const saveBtn = el('saveItemTypeBtn');
  const cancelBtn = el('cancelItemTypeBtn');
  const deleteBtn = el('deleteItemTypeBtn');
  const modal = el('itemTypesEditorModal');

  if (saveBtn) {
    saveBtn.addEventListener('click', saveItemType);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeItemTypeEditor);
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', deleteItemType);
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeItemTypeEditor();
      }
    });
  }

  // Block browser extensions from analyzing input fields
  const blockExtensions = (input) => {
    if (!input) return;

    // Comprehensive list of attributes to block various extensions
    const attrs = {
      'autocomplete': 'off',
      'data-1p-ignore': 'true',
      'data-lpignore': 'true',
      'data-form-type': 'other',
      'data-bwignore': 'true', // Bitwarden
      'data-dashlane-ignore': 'true', // Dashlane
      'data-kwimpalastatus': 'false', // Keeper
      'data-lastpass-ignore': 'true', // LastPass
      'data-np-checked': '1', // Norton
      'data-ms-editor': 'false', // Microsoft Editor
      'data-gramm': 'false', // Grammarly
      'data-gramm_editor': 'false', // Grammarly
      'spellcheck': 'false'
    };

    Object.entries(attrs).forEach(([key, value]) => {
      input.setAttribute(key, value);
    });

    // Add to input element's dataset to prevent classification
    input.dataset.noExtensions = 'true';

    // Remove readonly to make it editable
    input.removeAttribute('readonly');
  };

  // Apply blocking to item type editor inputs
  const labelInput = el('itemTypeLabelInput');
  const iconInput = el('itemTypeIconInput');

  blockExtensions(labelInput);
  blockExtensions(iconInput);

  // Re-apply blocking when modal opens (in case extensions re-analyze)
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.target === modal && modal.classList.contains('active')) {
        // Small delay to ensure inputs are rendered
        setTimeout(() => {
          const label = el('itemTypeLabelInput');
          const icon = el('itemTypeIconInput');

          // First set readonly to block extensions
          if (label) label.setAttribute('readonly', 'true');
          if (icon) icon.setAttribute('readonly', 'true');

          // Then after a tiny delay, remove readonly and apply blocking
          setTimeout(() => {
            blockExtensions(label);
            blockExtensions(icon);
          }, 100);
        }, 50);
      }
    });
  });

  if (modal) {
    observer.observe(modal, {
      attributes: true,
      attributeFilter: ['class']
    });
  }
}

