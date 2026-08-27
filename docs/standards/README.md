# docs/standards/ -- freshness authority

This directory is the **freshness authority** for the project's governing
standards documents.

Project knowledge holds the **working copy** that chats read by default. This
directory holds **the copy with a history**, so that a chat can determine
whether its own copy of a standard is current.

The copy here is updated **in the same turn** a new version of a standard is
delivered, before it is re-uploaded to project knowledge. A file here that is
behind project knowledge is a **defect in the delivery that produced it**, not
a signal to edit this copy by hand.

A chat fetches a file here at:

```
https://raw.githubusercontent.com/pina-hash/idea-app/main/docs/standards/<FILENAME>
```

See `REGISTER.md` in this directory for the full registered set, including
which files have not yet been mirrored here.
