let documentPrices = {};

document.addEventListener("DOMContentLoaded", async () => {
    try {
        const res = await fetch('/documents/prices');
        documentPrices = await res.json();
        console.log("✅ Document prices loaded:", documentPrices);

        // Initialize existing fieldset
        const container = document.getElementById("fieldsetsContainer");
        const firstFieldset = container.querySelector("fieldset");
        const typeSelect = firstFieldset.querySelector("select[name='type[]']");
        handleDocumentTypeChange(typeSelect);
    } catch (err) {
        console.error("⚠️ Failed to load document prices:", err);
    }
});

// Handle document type change
function handleDocumentTypeChange(select) {
    const fieldset = select.closest("fieldset");
    const optionsSelect = fieldset.querySelector(".document-options");
    const uploadDiv = fieldset.querySelector(".upload");
    const fileInput = uploadDiv.querySelector("input[type='file']");

    // Reset purpose dropdown & upload
    optionsSelect.innerHTML = "";
    uploadDiv.classList.add("hidden");
    fileInput.removeAttribute("required");

    if (select.value === "Transcript of Record") {
        optionsSelect.innerHTML += `<option value="Board Exam">For Board Exam</option>`;
        optionsSelect.innerHTML += `<option value="Reference" selected>For Reference</option>`;
        optionsSelect.innerHTML += `<option value="School Copy">For School Copy</option>`;
    } else if (select.value === "Form 137") {
        optionsSelect.innerHTML += `<option value="Reference" selected>For Reference</option>`;
        optionsSelect.innerHTML += `<option value="School Copy">For School Copy</option>`;
    } else if (select.value === "No Objection") {
        optionsSelect.innerHTML += `<option value="Reference" selected>For Reference</option>`;
        optionsSelect.innerHTML += `<option value="School Copy">For School Copy</option>`;
    } else if (select.value === "NSTP Serial Number") {
        optionsSelect.innerHTML += `<option value="Reference" selected>For Reference</option>`;
        optionsSelect.innerHTML += `<option value="School Copy">For School Copy</option>`;
    } else {
        optionsSelect.innerHTML += `<option value="Reference" selected>For Reference</option>`;
    }

    // File upload listener
    optionsSelect.addEventListener('change', function () {
        if (optionsSelect.value === "School Copy") {
            uploadDiv.classList.remove("hidden");
            fileInput.setAttribute("required", true);
        } else {
            uploadDiv.classList.add("hidden");
            fileInput.removeAttribute("required");
        }
    });

    // Quantity listener for total
    const qtyInput = fieldset.querySelector("input[name='qty[]']");
    qtyInput.addEventListener("input", () => updateTotalAmount(fieldset));
    updateTotalAmount(fieldset);
}

// Calculate total for a fieldset
function updateTotalAmount(fieldset) {
    const qtyInput = fieldset.querySelector("input[name='qty[]']");
    const typeSelect = fieldset.querySelector("select[name='type[]']");
    const totalSpan = fieldset.querySelector(".totalAmount");

    const qty = isNaN(qtyInput.value) || qtyInput.value <= 0 ? 1 : parseInt(qtyInput.value);
    const price = documentPrices[typeSelect.value] || 0;
    totalSpan.innerHTML = `Total Amount: ₱${(qty * price).toFixed(2)}`;
}

// Duplicate fieldset
document.addEventListener("DOMContentLoaded", () => {
    const addBtn = document.getElementById("addDoc");
    const container = document.getElementById("fieldsetsContainer");
    const warning = document.getElementById("warning1");

    addBtn.addEventListener("click", () => {
        const fieldsets = container.querySelectorAll("fieldset");
        const lastFieldset = fieldsets[fieldsets.length - 1];

        const requiredFields = lastFieldset.querySelectorAll("[required]");
        let allFilled = true;
        requiredFields.forEach(field => {
            if (!field.value || field.value.trim() === "") allFilled = false;
        });

        if (!allFilled) {
            warning.classList.remove("hidden");
            setTimeout(() => warning.classList.add("hidden"), 2000);
            return;
        }

        const clone = lastFieldset.cloneNode(true);

        // Reset inputs
        clone.querySelectorAll("input, select").forEach(inp => inp.value = "");
        clone.querySelector(".upload").classList.add("hidden");
        clone.querySelector(".totalAmount").innerHTML = "";

        // Enable remove button
        const removeBtnCard = clone.querySelector("#removeDocCard");
        if (removeBtnCard) removeBtnCard.classList.remove("hidden");

        const removeBtn = clone.querySelector("#removeDoc");
        if (removeBtn) removeBtn.addEventListener("click", () => clone.remove());

        container.appendChild(clone);

        const cloneTypeSelect = clone.querySelector("select[name='type[]']");
        handleDocumentTypeChange(cloneTypeSelect);
    });
});
