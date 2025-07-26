function aggregateValidationErrors(validations) {
  const structuredErrors = [];
  const flatMessages = [];

  for (const [field, errors] of Object.entries(validations)) {
    if (errors.length > 0) {
      structuredErrors.push({ [field]: errors });
      flatMessages.push(...errors);
    }
  }

  return {
    hasErrors: structuredErrors.length > 0,
    structuredErrors,
    flatMessage: flatMessages.join(", "),
  };
}

module.exports = aggregateValidationErrors;
